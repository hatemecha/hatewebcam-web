import {
  loadMediabunny,
  type AudioSample,
  type MediabunnyModule,
} from './mediabunny.ts';

const DEFAULT_MIN_BPM = 60;
const DEFAULT_MAX_BPM = 180;

export interface TempoBeat {
  time: number;
  strength: number;
}

export interface TempoAnalysis {
  bpm: number;
  confidence: number;
  beats: TempoBeat[];
}

interface TempoEstimate extends TempoAnalysis {
  duration: number;
}

interface Onset extends TempoBeat {
  index: number;
  value: number;
}

type AudioMediaModule = Pick<
  MediabunnyModule,
  'ALL_FORMATS' | 'Input' | 'BlobSource' | 'AudioSampleSink'
>;

interface TempoOptions {
  minBpm?: number;
  maxBpm?: number;
  start?: number;
  end?: number;
  mediaModule?: AudioMediaModule;
}

function normalizeOptions(options: TempoOptions = {}) {
  const minBpm = Math.max(30, Number(options.minBpm) || DEFAULT_MIN_BPM);
  const maxBpm = Math.min(
    240,
    Math.max(minBpm + 1, Number(options.maxBpm) || DEFAULT_MAX_BPM),
  );
  return { minBpm, maxBpm };
}

function getChannelMix(audioBuffer: AudioBuffer) {
  const channels = Math.max(1, audioBuffer.numberOfChannels || 1);
  const length = audioBuffer.length || 0;
  const samples = new Float32Array(length);
  for (let channel = 0; channel < channels; channel++) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < length; index++)
      samples[index] += data[index] / channels;
  }
  return samples;
}

function appendChunk(chunks: Float32Array[], chunk: Float32Array) {
  if (!chunk.length) return 0;
  chunks.push(chunk);
  return chunk.length;
}

function concatChunks(chunks: Float32Array[], totalLength: number) {
  const samples = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return samples;
}

function audioSampleToMono(sample: AudioSample) {
  const channels = Math.max(1, sample.numberOfChannels || 1);
  const frames = Math.max(0, sample.numberOfFrames || 0);
  if (!frames) return new Float32Array();
  const data = new Float32Array(
    sample.allocationSize({ planeIndex: 0, format: 'f32' }) / 4,
  );
  sample.copyTo(data, { planeIndex: 0, format: 'f32' });
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++)
      sum += data[frame * channels + channel] || 0;
    mono[frame] = sum / channels;
  }
  return mono;
}

function normalizeBpm(value: number, minBpm: number, maxBpm: number) {
  let bpm = Number(value) || 0;
  if (bpm <= 0 || !Number.isFinite(bpm)) return 0;
  while (bpm < minBpm) bpm *= 2;
  while (bpm > maxBpm) bpm /= 2;
  return bpm >= minBpm && bpm <= maxBpm ? bpm : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function findOnsets(samples: Float32Array, sampleRate: number): Onset[] {
  const frameSize = 1024;
  const hopSize = 512;
  const energies: number[] = [];
  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    let sum = 0;
    for (let index = start; index < start + frameSize; index++)
      sum += samples[index] * samples[index];
    energies.push(Math.sqrt(sum / frameSize));
  }
  if (energies.length < 3) return [];

  const flux = energies.map((energy, index) =>
    Math.max(0, energy - (energies[index - 1] || 0)),
  );
  const active = flux.filter((value) => value > 0);
  const floor = median(active);
  const peak = Math.max(...active, 0);
  if (!peak || peak < 0.01) return [];

  const threshold = floor + (peak - floor) * 0.35;
  const minGapFrames = Math.max(1, Math.round((sampleRate * 0.18) / hopSize));
  const onsets: Onset[] = [];
  for (let index = 1; index < flux.length - 1; index++) {
    const value = flux[index];
    if (value < threshold || value < flux[index - 1] || value < flux[index + 1])
      continue;
    const time = (index * hopSize) / sampleRate;
    const strength = peak ? value / peak : 0;
    const previous = onsets[onsets.length - 1];
    if (previous && index - previous.index < minGapFrames) {
      if (value > previous.value)
        onsets[onsets.length - 1] = { index, time, value, strength };
      continue;
    }
    onsets.push({ index, time, value, strength });
  }
  return onsets;
}

function estimateBpmFromOnsets(
  onsets: Onset[],
  minBpm: number,
  maxBpm: number,
) {
  const bins = new Map<number, number>();
  for (let index = 0; index < onsets.length; index++) {
    for (
      let next = index + 1;
      next < Math.min(onsets.length, index + 9);
      next++
    ) {
      const interval = onsets[next].time - onsets[index].time;
      if (interval < 0.2 || interval > 4) continue;
      const bpm = normalizeBpm(60 / interval, minBpm, maxBpm);
      if (!bpm) continue;
      const key = Math.round(bpm);
      const distance = next - index;
      const weight = distance === 1 ? 4 : 1 / distance;
      bins.set(
        key,
        (bins.get(key) || 0) +
          (onsets[index].strength + onsets[next].strength) * weight,
      );
    }
  }
  let bestBpm = 0;
  let bestScore = 0;
  let totalScore = 0;
  bins.forEach((score, bpm) => {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  });
  return { bpm: bestBpm, score: bestScore, totalScore };
}

function buildBeatGrid(
  onsets: Onset[],
  duration: number,
  bpm: number,
): TempoBeat[] {
  if (!bpm || !onsets.length) return [];
  const period = 60 / bpm;
  let start = onsets[0].time;
  while (start - period >= 0) start -= period;
  const beats: TempoBeat[] = [];
  for (let time = start; time <= duration + 0.001; time += period) {
    const nearest = onsets.reduce<{ delta: number; onset: Onset | null }>(
      (best, onset) => {
        const delta = Math.abs(onset.time - time);
        return delta < best.delta ? { delta, onset } : best;
      },
      { delta: period, onset: null },
    );
    beats.push({
      time: Math.round(time * 1000) / 1000,
      strength:
        nearest.onset && nearest.delta <= period * 0.35
          ? nearest.onset.strength
          : 0.5,
    });
  }
  return beats;
}

export function estimateTempoFromSamples(
  samples: ArrayLike<number> | null,
  sampleRate: number,
  options: TempoOptions = {},
): TempoEstimate {
  const { minBpm, maxBpm } = normalizeOptions(options);
  const data =
    samples instanceof Float32Array ? samples : new Float32Array(samples || []);
  const safeSampleRate = Math.max(1, Number(sampleRate) || 1);
  const duration = data.length / safeSampleRate;
  const onsets = findOnsets(data, safeSampleRate);
  if (duration <= 0 || onsets.length < 2) {
    return { bpm: 0, confidence: 0, beats: [], duration };
  }

  const { bpm, score, totalScore } = estimateBpmFromOnsets(
    onsets,
    minBpm,
    maxBpm,
  );
  if (!bpm) return { bpm: 0, confidence: 0, beats: [], duration };
  const confidence = Math.min(
    1,
    Math.max(
      0,
      (score / Math.max(1, totalScore)) * Math.min(1, onsets.length / 8) * 2,
    ),
  );
  return {
    bpm,
    confidence: Math.round(confidence * 100) / 100,
    beats: buildBeatGrid(onsets, duration, bpm),
    duration,
  };
}

export function estimateTempoFromAudioBuffer(
  audioBuffer: AudioBuffer,
  options: TempoOptions = {},
) {
  return estimateTempoFromSamples(
    getChannelMix(audioBuffer),
    audioBuffer.sampleRate,
    options,
  );
}

export async function extractMediaAudioSamples(
  file: Blob | null,
  options: TempoOptions = {},
) {
  if (!file) throw new Error('audio_file_unavailable');
  const mediabunny: AudioMediaModule =
    options.mediaModule || (await loadMediabunny());
  const { Input, BlobSource, ALL_FORMATS, AudioSampleSink } = mediabunny;
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  try {
    if (typeof input.canRead === 'function' && !(await input.canRead()))
      throw new Error('audio_input_unreadable');
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error('audio_track_missing');
    if (typeof track.canDecode === 'function' && !(await track.canDecode()))
      throw new Error('audio_track_undecodable');

    const sink = new AudioSampleSink(track);
    const chunks: Float32Array[] = [];
    let totalLength = 0;
    let sampleRate = 0;
    const end =
      options.end !== undefined && Number.isFinite(options.end)
        ? options.end
        : Number.POSITIVE_INFINITY;
    for await (const sample of sink.samples(
      Math.max(0, Number(options.start) || 0),
      end,
    )) {
      try {
        sampleRate ||= sample.sampleRate || 0;
        totalLength += appendChunk(chunks, audioSampleToMono(sample));
      } finally {
        sample.close?.();
      }
    }
    if (!totalLength || !sampleRate) throw new Error('audio_track_empty');
    return { samples: concatChunks(chunks, totalLength), sampleRate };
  } finally {
    input.dispose?.();
  }
}

export async function analyzeAudioTempoWithAudioContext(
  file: Blob | null,
  options: TempoOptions = {},
) {
  const AudioContextImpl =
    globalThis.AudioContext ||
    (
      globalThis as typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!AudioContextImpl) throw new Error('audio_context_unavailable');
  if (!file?.arrayBuffer) throw new Error('audio_file_unavailable');

  let context: AudioContext | null = null;
  try {
    context = new AudioContextImpl();
    const data = await file.arrayBuffer();
    const buffer = await context.decodeAudioData(data.slice(0));
    return estimateTempoFromAudioBuffer(buffer, options);
  } catch {
    throw new Error('audio_decode_failed');
  } finally {
    if (typeof context?.close === 'function')
      await context.close().catch(() => {});
  }
}

export async function analyzeAudioTempo(
  file: Blob | null,
  options: TempoOptions = {},
): Promise<TempoEstimate> {
  try {
    const { samples, sampleRate } = await extractMediaAudioSamples(
      file,
      options,
    );
    return estimateTempoFromSamples(samples, sampleRate, options);
  } catch (err) {
    try {
      return await analyzeAudioTempoWithAudioContext(file, options);
    } catch {
      throw err || new Error('audio_decode_failed');
    }
  }
}

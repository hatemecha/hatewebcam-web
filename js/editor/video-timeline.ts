/** Small, dependency-free timeline model used by the local video editor. */
import {
  normalizeTimelineClipType,
  VISUAL_FX_CLIP_TYPE,
} from './timeline-clip-types.ts';

export interface TimelineItem {
  id: string;
  type: string;
  startTime: number;
  endTime: number;
  config: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TimelineMarker {
  id: string;
  time: number;
  kind: string;
  source: string;
  strength: number;
  label: string;
  [key: string]: unknown;
}

export interface TimelineJson {
  trim: { start: number; end: number };
  items: TimelineItem[];
  markers: TimelineMarker[];
}

export interface TimelineSourceData {
  trim?: { start?: unknown; end?: unknown };
  trimStart?: unknown;
  trimEnd?: unknown;
  items?: Array<Partial<TimelineItem>>;
  markers?: Array<Partial<TimelineMarker>>;
}

export interface MarkerToggle {
  action: 'added' | 'removed';
  marker: TimelineMarker;
}

function cloneConfig(config: unknown): Record<string, unknown> {
  return typeof structuredClone === 'function'
    ? (structuredClone(config) as Record<string, unknown>)
    : (JSON.parse(JSON.stringify(config || {})) as Record<string, unknown>);
}

function createId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export class VideoTimeline {
  static TYPES = ['look', VISUAL_FX_CLIP_TYPE, 'blob', 'face', 'blink'];
  static MARKER_KINDS = ['manual', 'beat', 'bar', 'section'];
  static MARKER_SOURCES = ['user', 'edit-assist'];

  duration: number;
  trimStart: number;
  trimEnd: number;
  items: TimelineItem[];
  markers: TimelineMarker[];

  constructor(duration = 0) {
    this.duration = Math.max(0, Number(duration) || 0);
    this.trimStart = 0;
    this.trimEnd = this.duration;
    this.items = [];
    this.markers = [];
  }

  setDuration(duration: unknown): void {
    this.duration = Math.max(0, Number(duration) || 0);
    this.trimStart = Math.min(this.trimStart, this.duration);
    this.trimEnd = this.duration;
    this.items = [];
    this.markers = [];
  }

  setTrim(startTime: unknown, endTime: unknown): void {
    const start = this.#time(startTime);
    const end = this.#time(endTime);
    if (end <= start) throw new Error('El final debe ser posterior al inicio.');
    if (
      this.items.some((item) => item.startTime < start || item.endTime > end)
    ) {
      throw new Error('Hay efectos fuera del nuevo recorte.');
    }
    this.trimStart = start;
    this.trimEnd = end;
  }

  add(
    type: string,
    startTime: unknown,
    endTime: unknown,
    config: Record<string, unknown> = {},
  ): TimelineItem {
    return this.upsert({
      id: createId(),
      type: normalizeTimelineClipType(type),
      startTime: this.#time(startTime),
      endTime: this.#time(endTime),
      config: cloneConfig(config),
    });
  }

  upsert(candidate: TimelineItem): TimelineItem {
    const type = normalizeTimelineClipType(candidate.type);
    if (!VideoTimeline.TYPES.includes(type))
      throw new Error('Tipo de efecto inválido.');
    const item: TimelineItem = {
      ...candidate,
      type,
      startTime: this.#time(candidate.startTime),
      endTime: this.#time(candidate.endTime),
    };
    if (
      item.startTime < this.trimStart ||
      item.endTime > this.trimEnd ||
      item.endTime <= item.startTime
    ) {
      throw new Error('El efecto debe quedar dentro del recorte.');
    }
    const overlaps = this.items.some(
      (current) =>
        current.id !== item.id &&
        current.type === item.type &&
        item.startTime < current.endTime &&
        item.endTime > current.startTime,
    );
    if (overlaps)
      throw new Error('No se pueden superponer efectos del mismo tipo.');
    const index = this.items.findIndex((current) => current.id === item.id);
    if (index === -1) this.items.push(item);
    else this.items[index] = item;
    this.items.sort((a, b) => a.startTime - b.startTime);
    return item;
  }

  remove(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
  }

  split(
    id: string,
    time: unknown,
    minSpan = 0.05,
  ): [TimelineItem, TimelineItem] {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Clip no encontrado.');
    const item = this.items[index];
    const splitTime = this.#time(time);
    const min = Math.max(0, Number(minSpan) || 0);
    if (splitTime <= item.startTime + min || splitTime >= item.endTime - min) {
      throw new Error('Elegí un punto dentro del clip.');
    }
    const left: TimelineItem = {
      ...item,
      endTime: splitTime,
      config: cloneConfig(item.config),
    };
    const right: TimelineItem = {
      ...item,
      id: createId(),
      startTime: splitTime,
      config: cloneConfig(item.config),
    };
    this.items[index] = left;
    this.items.push(right);
    this.items.sort((a, b) => a.startTime - b.startTime);
    return [left, right];
  }

  addMarker(
    marker: Partial<TimelineMarker> = {},
    threshold = 0.01,
  ): TimelineMarker {
    const saved = this.#marker(marker);
    const maxDelta = Math.max(0, Number(threshold) || 0);
    const existing = this.markers.find(
      (current) =>
        current.source === saved.source &&
        current.kind === saved.kind &&
        Math.abs(current.time - saved.time) <= maxDelta,
    );
    if (existing) return existing;

    this.markers.push(saved);
    this.markers.sort((a, b) => a.time - b.time);
    return saved;
  }

  addMarkers(
    markers: Array<Partial<TimelineMarker>> = [],
    threshold = 0.01,
  ): TimelineMarker[] {
    return markers.map((marker) => this.addMarker(marker, threshold));
  }

  clearMarkersBySource(source: string): void {
    const markerSource = VideoTimeline.MARKER_SOURCES.includes(source)
      ? source
      : 'user';
    this.markers = this.markers.filter(
      (marker) => (marker.source || 'user') !== markerSource,
    );
  }

  getMarkersBySource(source: string): TimelineMarker[] {
    const markerSource = VideoTimeline.MARKER_SOURCES.includes(source)
      ? source
      : 'user';
    return this.markers.filter(
      (marker) => (marker.source || 'user') === markerSource,
    );
  }

  toggleMarker(time: unknown, threshold = 0.08): MarkerToggle {
    const markerTime = this.#time(time);
    const maxDelta = Math.max(0, Number(threshold) || 0);
    const existingIndex = this.markers.findIndex(
      (marker) =>
        (marker.source || 'user') === 'user' &&
        Math.abs(marker.time - markerTime) <= maxDelta,
    );
    if (existingIndex !== -1) {
      const [removed] = this.markers.splice(existingIndex, 1);
      return { action: 'removed', marker: removed };
    }

    const marker = this.addMarker({ time: markerTime });
    return { action: 'added', marker };
  }

  removeMarker(id: string): void {
    this.markers = this.markers.filter((marker) => marker.id !== id);
  }

  getSnapPoints(): number[] {
    return [
      this.trimStart,
      this.trimEnd,
      ...this.markers.map((marker) => marker.time),
      ...this.items.flatMap((item) => [item.startTime, item.endTime]),
    ];
  }

  toJSON(): TimelineJson {
    return {
      trim: {
        start: this.trimStart,
        end: this.trimEnd,
      },
      items: this.items.map((item) => ({
        ...item,
        config: cloneConfig(item.config || {}),
      })),
      markers: this.markers.map((marker) => ({ ...marker })),
    };
  }

  static fromJSON(data: TimelineSourceData = {}, duration = 0): VideoTimeline {
    const timeline = new VideoTimeline(duration);
    const trim = data.trim || {};
    const trimStart = Number(trim.start ?? data.trimStart ?? 0);
    const trimEnd = Number(trim.end ?? data.trimEnd ?? duration);
    if (
      Number.isFinite(trimStart) &&
      Number.isFinite(trimEnd) &&
      trimEnd > trimStart
    ) {
      timeline.setTrim(trimStart, trimEnd);
    }
    (data.items || []).forEach((item) => {
      timeline.upsert({
        id: item.id || createId(),
        type: normalizeTimelineClipType(item.type || ''),
        startTime: Number(item.startTime),
        endTime: Number(item.endTime),
        config: cloneConfig(item.config),
      });
    });
    timeline.addMarkers(data.markers || []);
    return timeline;
  }

  activeAt(time: unknown): TimelineItem[] {
    const currentTime = this.#time(time);
    return VideoTimeline.TYPES.map((type) =>
      this.items.find(
        (item) =>
          item.type === type &&
          currentTime >= item.startTime &&
          currentTime < item.endTime,
      ),
    ).filter((item): item is TimelineItem => Boolean(item));
  }

  #time(value: unknown): number {
    const number = Number(value);
    return Math.min(
      this.duration,
      Math.max(0, Number.isFinite(number) ? number : 0),
    );
  }

  #marker(marker: Partial<TimelineMarker>): TimelineMarker {
    const kind = VideoTimeline.MARKER_KINDS.includes(marker.kind || '')
      ? (marker.kind as string)
      : 'manual';
    const source = VideoTimeline.MARKER_SOURCES.includes(marker.source || '')
      ? (marker.source as string)
      : 'user';
    const strength = Number(marker.strength);
    return {
      id: marker.id || createId(),
      time: this.#time(marker.time),
      kind,
      source,
      strength: Number.isFinite(strength)
        ? Math.min(1, Math.max(0, strength))
        : 1,
      label:
        marker.label ||
        (kind === 'manual' ? 'Marcador' : kind === 'bar' ? 'Compás' : 'Beat'),
    };
  }
}

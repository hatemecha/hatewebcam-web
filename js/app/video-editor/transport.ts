import {
  publishTransportPosition,
  publishTransportReadout,
  setTransportActions,
} from '../../../src/lib/editor/transport-store.ts';
import { formatDurationDetailed } from '../media-format.ts';
import type { VideoEditorSession } from './session.ts';

import { getVideoPlayableEnd } from './playable-end.ts';

export interface TransportOptions {
  video: HTMLVideoElement;
  playhead: HTMLElement | null;
  inVideoMode: () => boolean;
  cancelRender: () => void;
  ensureRender: () => void;
  onSeek: () => void;
  onSeeked: () => void;
  onPlayFailure: () => void;
}

export class VideoTransport {
  private readout = { timeLabel: '00:00 / 00:00', paused: true };
  private position = { currentTime: 0, duration: 0 };
  private playheadLeft = '';
  private listeners: AbortController | null = null;

  constructor(
    private readonly session: Pick<
      VideoEditorSession,
      'timeline' | 'source' | 'exportSession'
    >,
    private readonly options: TransportOptions,
  ) {}

  bind(): void {
    if (this.listeners) return;
    this.listeners = new AbortController();
    const { signal } = this.listeners;
    const { video } = this.options;
    video.addEventListener('play', () => this.update(), { signal });
    video.addEventListener('pause', () => this.update(), { signal });
    video.addEventListener(
      'seeked',
      () => {
        if (!this.options.inVideoMode()) return;
        this.update();
        this.options.onSeeked();
      },
      { signal },
    );
    setTransportActions(this);
  }

  dispose(): void {
    this.listeners?.abort();
    this.listeners = null;
    setTransportActions(null);
  }

  update(): void {
    if (!this.options.inVideoMode()) return;
    const duration = this.session.timeline.duration;
    const { currentTime, paused } = this.options.video;
    if (
      this.position.currentTime !== currentTime ||
      this.position.duration !== duration
    ) {
      this.position = { currentTime, duration };
      publishTransportPosition(this.position);
    }
    const timeLabel = `${formatDurationDetailed(currentTime)} / ${formatDurationDetailed(duration)}`;
    if (
      this.readout.timeLabel !== timeLabel ||
      this.readout.paused !== paused
    ) {
      this.readout = { timeLabel, paused };
      publishTransportReadout(this.readout);
    }
    if (duration > 0 && this.options.playhead) {
      const left = `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%`;
      if (left !== this.playheadLeft) {
        this.playheadLeft = left;
        this.options.playhead.style.left = left;
      }
    }
  }

  async toggle(): Promise<void> {
    if (!this.session.source.file || this.session.exportSession.active) return;
    const { video } = this.options;
    if (video.paused) {
      const { duration, trimStart, trimEnd } = this.session.timeline;
      if (
        video.currentTime < trimStart ||
        video.currentTime >= getVideoPlayableEnd(duration, trimEnd)
      ) {
        this.options.cancelRender();
        video.currentTime = trimStart;
      }
      try {
        await video.play();
      } catch {
        if (this.options.inVideoMode()) this.options.onPlayFailure();
      }
      if (!this.options.inVideoMode()) return;
      this.options.ensureRender();
    } else {
      video.pause();
    }
    this.update();
  }

  seek(time: number): void {
    if (!this.session.source.file || this.session.exportSession.active) return;
    const { video } = this.options;
    const { duration, trimStart, trimEnd } = this.session.timeline;
    const end = getVideoPlayableEnd(duration, trimEnd);
    const next = Math.min(
      Math.max(trimStart, end),
      Math.max(trimStart, time || 0),
    );
    if (next !== video.currentTime) this.options.onSeek();
    video.currentTime = next;
    this.update();
    this.options.ensureRender();
  }

  boundary(edge: 'start' | 'end'): void {
    this.seek(
      edge === 'start'
        ? this.session.timeline.trimStart
        : this.session.timeline.trimEnd,
    );
  }

  jump(seconds: number): void {
    this.seek(this.options.video.currentTime + seconds);
  }
}

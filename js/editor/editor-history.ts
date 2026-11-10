/** Lightweight undo/redo stack for the local video editor timeline. */

export interface TimelineItemLike {
  id: string;
  type: string;
  startTime: number;
  endTime: number;
  config: unknown;
  [key: string]: unknown;
}

export interface TimelineMarkerLike {
  [key: string]: unknown;
}

export interface TimelineLike {
  trimStart: number;
  trimEnd: number;
  markers: TimelineMarkerLike[];
  items: TimelineItemLike[];
}

export interface TimelineSnapshot {
  trimStart: number;
  trimEnd: number;
  markers: TimelineMarkerLike[];
  items: TimelineItemLike[];
}

function cloneConfig(config: unknown): unknown {
  return typeof structuredClone === 'function'
    ? structuredClone(config)
    : JSON.parse(JSON.stringify(config || {}));
}

export class EditorHistory {
  private limit: number;
  private undoStack: TimelineSnapshot[];
  private redoStack: TimelineSnapshot[];

  constructor(limit = 50) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  snapshot(timeline: TimelineLike): TimelineSnapshot {
    return {
      trimStart: timeline.trimStart,
      trimEnd: timeline.trimEnd,
      markers: (timeline.markers || []).map((marker) => ({ ...marker })),
      items: timeline.items.map((item) => ({
        id: item.id,
        type: item.type,
        startTime: item.startTime,
        endTime: item.endTime,
        config: cloneConfig(item.config),
      })),
    };
  }

  pushSnapshot(snapshot: TimelineSnapshot): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  push(timeline: TimelineLike): void {
    this.pushSnapshot(this.snapshot(timeline));
  }

  restore(timeline: TimelineLike, snapshot: TimelineSnapshot): void {
    timeline.trimStart = snapshot.trimStart;
    timeline.trimEnd = snapshot.trimEnd;
    timeline.markers = (snapshot.markers || []).map((marker) => ({
      ...marker,
    }));
    timeline.items = snapshot.items.map((item) => ({
      ...item,
      config: cloneConfig(item.config),
    }));
  }

  undo(timeline: TimelineLike): boolean {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(this.snapshot(timeline));
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.restore(timeline, previous);
    return true;
  }

  redo(timeline: TimelineLike): boolean {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(this.snapshot(timeline));
    const next = this.redoStack.pop();
    if (!next) return false;
    this.restore(timeline, next);
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

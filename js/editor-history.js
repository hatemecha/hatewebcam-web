/** Lightweight undo/redo stack for the local video editor timeline. */
class EditorHistory {
  constructor(limit = 50) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  snapshot(timeline) {
    return {
      trimStart: timeline.trimStart,
      trimEnd: timeline.trimEnd,
      items: timeline.items.map((item) => ({
        id: item.id,
        type: item.type,
        startTime: item.startTime,
        endTime: item.endTime,
        config: typeof structuredClone === 'function'
          ? structuredClone(item.config)
          : JSON.parse(JSON.stringify(item.config || {})),
      })),
    };
  }

  push(timeline) {
    this.undoStack.push(this.snapshot(timeline));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  restore(timeline, snapshot) {
    timeline.trimStart = snapshot.trimStart;
    timeline.trimEnd = snapshot.trimEnd;
    timeline.items = snapshot.items.map((item) => ({
      ...item,
      config: typeof structuredClone === 'function'
        ? structuredClone(item.config)
        : JSON.parse(JSON.stringify(item.config || {})),
    }));
  }

  undo(timeline) {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(this.snapshot(timeline));
    const previous = this.undoStack.pop();
    this.restore(timeline, previous);
    return true;
  }

  redo(timeline) {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(this.snapshot(timeline));
    const next = this.redoStack.pop();
    this.restore(timeline, next);
    return true;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }
}

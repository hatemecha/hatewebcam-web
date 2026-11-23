/** @param {import('./controller.mjs').AppController} proto */
export function applyVideoEditorClipboardMixin(proto) {
  proto.getSelectedVideoEffectItems = function () {
    const ids = this.selectedVideoEffectIds?.size
      ? this.selectedVideoEffectIds
      : new Set(this.selectedVideoEffectId ? [this.selectedVideoEffectId] : []);
    return this.editor.timeline.items.filter((item) => ids.has(item.id));
  };

  proto.deleteSelectedVideoEffect = function () {
    const items = this.getSelectedVideoEffectItems();
    if (!items.length) return;
    this.pushTimelineHistory();
    items.forEach((item) => this.editor.timeline.remove(item.id));
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    void this.syncVideoTimelineEffects(true);
  };

  proto.copySelectedVideoEffects = function (cut = false) {
    const items = this.getSelectedVideoEffectItems();
    if (!items.length) return;
    const origin = Math.min(...items.map((item) => item.startTime));
    this.timelineClipboard = {
      origin,
      items: items.map((item) => ({
        type: item.type,
        startTime: item.startTime,
        endTime: item.endTime,
        config:
          typeof structuredClone === 'function'
            ? structuredClone(item.config || {})
            : JSON.parse(JSON.stringify(item.config || {})),
      })),
    };
    if (cut) this.deleteSelectedVideoEffect();
    this.updateTimelineClipboardStatus(
      `Portapapeles: ${items.length} clip${items.length === 1 ? '' : 's'} ${cut ? 'cortado' : 'copiado'}. Ctrl+V pega clips, Shift+Ctrl+V pega ajustes.`,
    );
  };

  proto.pasteVideoEffects = function (settingsOnly = false) {
    if (!this.timelineClipboard?.items?.length || !this.editor.source?.file)
      return;
    const selectedItems = this.getSelectedVideoEffectItems();
    if (settingsOnly) {
      if (!selectedItems.length) return;
      const snapshot =
        this.editor.history?.snapshot?.(this.editor.timeline) || null;
      let applied = 0;
      selectedItems.forEach((item) => {
        const source =
          this.timelineClipboard.items.find(
            (clip) => clip.type === item.type,
          ) || this.timelineClipboard.items[0];
        if (source.type !== item.type) return;
        this.editor.timeline.upsert({
          ...item,
          config:
            typeof structuredClone === 'function'
              ? structuredClone(source.config || {})
              : JSON.parse(JSON.stringify(source.config || {})),
        });
        applied += 1;
      });
      if (applied) this.pushTimelineHistorySnapshot(snapshot);
      this.renderVideoTimeline();
      this.updateTimelineClipboardStatus(
        `Ajustes pegados en ${applied} clip${applied === 1 ? '' : 's'}.`,
      );
      void this.syncVideoTimelineEffects(true);
      return;
    }

    const anchor = this.clamp(
      this.videoEl.currentTime || this.editor.timeline.trimStart,
      this.editor.timeline.trimStart,
      this.editor.timeline.trimEnd,
    );
    const newIds = [];
    // Paste is all or nothing: a clip that lands outside the trim used to
    // leave the earlier ones applied plus a history entry.
    const snapshot =
      this.editor.history?.snapshot?.(this.editor.timeline) || null;
    try {
      this.timelineClipboard.items.forEach((clip) => {
        const offset = clip.startTime - this.timelineClipboard.origin;
        const span = clip.endTime - clip.startTime;
        const startTime = this.roundTimelineTime(anchor + offset);
        const endTime = this.roundTimelineTime(startTime + span);
        const saved = this.editor.timeline.upsert({
          id: crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
          type: clip.type,
          startTime,
          endTime,
          config:
            typeof structuredClone === 'function'
              ? structuredClone(clip.config || {})
              : JSON.parse(JSON.stringify(clip.config || {})),
        });
        newIds.push(saved.id);
      });
      this.pushTimelineHistorySnapshot(snapshot);
      this.selectedVideoEffectIds = new Set(newIds);
      this.selectedVideoEffectId = newIds[0] || '';
      this.renderVideoTimeline();
      this.updateVideoEffectInspector();
      this.updateTimelineClipboardStatus(`Clips pegados: ${newIds.length}.`);
      void this.syncVideoTimelineEffects(true);
    } catch (err) {
      if (snapshot && this.editor.history) {
        this.editor.history.restore(this.editor.timeline, snapshot);
        this.renderVideoTimeline();
        this.updateVideoEffectInspector();
      }
      this.showStatus(this.videoEditorStatus, err.message, 'error');
    }
  };
}

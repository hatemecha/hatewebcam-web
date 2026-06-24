/** @param {import('./controller.mjs').AppController} proto */
export function applyVideoEditorClipboardMixin(proto) {
  proto.getSelectedVideoEffectItems = function () {
    const ids = this.selectedVideoEffectIds?.size
      ? this.selectedVideoEffectIds
      : new Set(this.selectedVideoEffectId ? [this.selectedVideoEffectId] : []);
    return this.videoTimeline.items.filter((item) => ids.has(item.id));
  };

  proto.deleteSelectedVideoEffect = function () {
    const items = this.getSelectedVideoEffectItems();
    if (!items.length) return;
    this.pushTimelineHistory();
    items.forEach((item) => this.videoTimeline.remove(item.id));
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
    if (!this.timelineClipboard?.items?.length || !this.videoSourceFile) return;
    const selectedItems = this.getSelectedVideoEffectItems();
    if (settingsOnly) {
      if (!selectedItems.length) return;
      this.pushTimelineHistory();
      selectedItems.forEach((item) => {
        const source =
          this.timelineClipboard.items.find(
            (clip) => clip.type === item.type,
          ) || this.timelineClipboard.items[0];
        if (source.type !== item.type) return;
        this.videoTimeline.upsert({
          ...item,
          config:
            typeof structuredClone === 'function'
              ? structuredClone(source.config || {})
              : JSON.parse(JSON.stringify(source.config || {})),
        });
      });
      this.renderVideoTimeline();
      this.updateTimelineClipboardStatus(
        `Ajustes pegados en ${selectedItems.length} clip${selectedItems.length === 1 ? '' : 's'}.`,
      );
      void this.syncVideoTimelineEffects(true);
      return;
    }

    const anchor = this.clamp(
      this.videoEl.currentTime || this.videoTimeline.trimStart,
      this.videoTimeline.trimStart,
      this.videoTimeline.trimEnd,
    );
    const newIds = [];
    try {
      this.pushTimelineHistory();
      this.timelineClipboard.items.forEach((clip) => {
        const offset = clip.startTime - this.timelineClipboard.origin;
        const span = clip.endTime - clip.startTime;
        const startTime = this.roundTimelineTime(anchor + offset);
        const endTime = this.roundTimelineTime(startTime + span);
        const saved = this.videoTimeline.upsert({
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
      this.selectedVideoEffectIds = new Set(newIds);
      this.selectedVideoEffectId = newIds[0] || '';
      this.renderVideoTimeline();
      this.updateVideoEffectInspector();
      this.updateTimelineClipboardStatus(`Clips pegados: ${newIds.length}.`);
      void this.syncVideoTimelineEffects(true);
    } catch (err) {
      this.showStatus(this.videoEditorStatus, err.message, 'error');
    }
  };
}

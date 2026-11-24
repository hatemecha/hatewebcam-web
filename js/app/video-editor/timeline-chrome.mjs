import { TIMELINE_TRACK_COUNT } from '../constants.ts';
import { updateEditorUiState } from '../../../src/lib/editor/editor-state.ts';
import { translateCurrent } from '../../../src/lib/i18n/translate.ts';

/** @param {import('../controller.mjs').AppController} proto */
export function applyVideoEditorTimelineChromeMixin(proto) {
  proto.pushTimelineHistory = function () {
    if (
      !this.editor.history ||
      this.timelineHistorySuspended ||
      !this.editor.source?.file
    )
      return;
    this.editor.history.push(this.editor.timeline);
    this.updateEditorHistoryButtons();
  };

  proto.pushTimelineHistorySnapshot = function (snapshot) {
    if (
      !snapshot ||
      !this.editor.history ||
      this.timelineHistorySuspended ||
      !this.editor.source?.file
    )
      return;
    this.editor.history.pushSnapshot(snapshot);
    this.updateEditorHistoryButtons();
  };

  proto.undoTimelineEdit = function () {
    if (!this.editor.history?.undo(this.editor.timeline)) return;
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.applyVideoTrim(false);
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    void this.editor?.timelineEffects.sync(true);
  };

  proto.redoTimelineEdit = function () {
    if (!this.editor.history?.redo(this.editor.timeline)) return;
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.applyVideoTrim(false);
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    void this.editor?.timelineEffects.sync(true);
  };

  proto.updateEditorHistoryButtons = function () {
    updateEditorUiState({
      canUndo:
        !!this.editor.history?.canUndo && !this.editor.exportSession?.active,
      canRedo:
        !!this.editor.history?.canRedo && !this.editor.exportSession?.active,
      exporting: !!this.editor.exportSession?.active,
    });
  };

  proto.applyTimelineZoom = function () {
    if (!this.timelineScroll || !this.timelineTrackArea) return;
    const baseWidth = this.timelineViewport
      ? this.timelineViewport.clientWidth - 72
      : 800;
    const width = Math.max(baseWidth, baseWidth * this.timelineZoom);
    this.timelineScroll.style.width = `${width + 72}px`;
    if (this.timelineZoomInput)
      this.timelineZoomInput.value = String(this.timelineZoom);
    this.renderVideoTimeline();
    this.renderTimelineRuler();
  };

  proto.getTimelineTrackAreaBounds = function () {
    if (!this.timelineTrackArea)
      return { left: 0, top: 0, width: 1, height: 1 };
    const rect = this.timelineTrackArea.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    };
  };

  proto.renderTimelineRuler = function () {
    if (!this.timelineTimeRuler || !this.timelineTrackArea) return;
    const duration = Math.max(0.001, this.editor.timeline.duration);
    const width = this.timelineTrackArea.offsetWidth;
    this.editor.timelineView.renderRuler({
      ruler: this.timelineTimeRuler,
      duration,
      width,
    });
  };

  proto.positionTimelineElement = function (el, startTime, endTime = null) {
    const duration = Math.max(0.001, this.editor.timeline.duration);
    const left = (startTime / duration) * 100;
    el.style.left = `${this.clamp(left, 0, 100)}%`;
    if (endTime != null) {
      el.style.width = `${this.clamp(((endTime - startTime) / duration) * 100, 0, 100)}%`;
    }
  };

  proto.getTimelineTrackCount = function () {
    return TIMELINE_TRACK_COUNT;
  };

  proto.getTimelineItemElements = function () {
    return this.timelineTrackArea
      ? this.timelineTrackArea.querySelectorAll('.timeline-item')
      : [];
  };

  proto.clearTimelineItemElements = function () {
    this.getTimelineItemElements().forEach((el) => el.remove());
    if (this.timelineItems) this.timelineItems.innerHTML = '';
  };

  proto.appendTimelineClip = function (el, type) {
    const track = this.timelineTrackArea?.querySelector(
      `.timeline-track-effects[data-track="${type}"]`,
    );
    (track || this.timelineItems)?.appendChild(el);
  };

  proto.getTimelineRowStyle = function (rowIndex) {
    const count = this.getTimelineTrackCount();
    return {
      top: `calc(${rowIndex} * 100% / ${count})`,
      height: `calc(100% / ${count})`,
    };
  };

  proto.positionTimelineRowElement = function (
    el,
    startTime,
    endTime,
    rowIndex,
  ) {
    this.positionTimelineElement(el, startTime, endTime);
    if (el.closest?.('.timeline-track-effects')) {
      el.style.top = '';
      el.style.height = '';
      return;
    }
    const rowStyle = this.getTimelineRowStyle(rowIndex);
    el.style.top = rowStyle.top;
    el.style.height = rowStyle.height;
  };

  proto.toggleTimelineMarkerAtPlayhead = function () {
    if (
      !this.editor.source?.file ||
      typeof this.editor.timeline.toggleMarker !== 'function'
    )
      return;
    const threshold = 0.08 / Math.max(1, this.timelineZoom);
    this.pushTimelineHistory();
    const result = this.editor.timeline.toggleMarker(
      this.videoEl.currentTime || this.editor.timeline.trimStart,
      threshold,
    );
    this.renderVideoTimeline();
    this.showStatus(
      this.videoEditorStatus,
      translateCurrent(
        result.action === 'added'
          ? 'Marcador agregado.'
          : 'Marcador eliminado.',
      ),
      'success',
    );
    setTimeout(() => this.hideStatus(this.videoEditorStatus), 900);
    this.updateTimelineHint();
  };

  proto.getTimelineTime = function (clientX) {
    return this.snapTimelineTime(this.getTimelineRawTime(clientX));
  };

  proto.getTimelineRawTime = function (clientX) {
    const bounds = this.getTimelineTrackAreaBounds();
    const ratio = this.clamp((clientX - bounds.left) / bounds.width, 0, 1);
    return ratio * this.editor.timeline.duration;
  };
}

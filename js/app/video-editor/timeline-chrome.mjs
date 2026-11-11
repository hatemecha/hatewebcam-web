import { TIMELINE_TRACK_COUNT } from '../constants.mjs';
import { updateEditorUiState } from '../../../src/lib/editor/editor-state.ts';
import { translateCurrent } from '../../../src/lib/i18n/translate.ts';

/** @param {import('../controller.mjs').AppController} proto */
export function applyVideoEditorTimelineChromeMixin(proto) {
  proto.pushTimelineHistory = function () {
    if (
      !this.editorHistory ||
      this.timelineHistorySuspended ||
      !this.videoSourceFile
    )
      return;
    this.editorHistory.push(this.videoTimeline);
    this.updateEditorHistoryButtons();
  };

  proto.pushTimelineHistorySnapshot = function (snapshot) {
    if (
      !snapshot ||
      !this.editorHistory ||
      this.timelineHistorySuspended ||
      !this.videoSourceFile
    )
      return;
    this.editorHistory.pushSnapshot(snapshot);
    this.updateEditorHistoryButtons();
  };

  proto.undoTimelineEdit = function () {
    if (!this.editorHistory?.undo(this.videoTimeline)) return;
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.applyVideoTrim(false);
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    void this.syncVideoTimelineEffects(true);
  };

  proto.redoTimelineEdit = function () {
    if (!this.editorHistory?.redo(this.videoTimeline)) return;
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.applyVideoTrim(false);
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    void this.syncVideoTimelineEffects(true);
  };

  proto.updateEditorHistoryButtons = function () {
    updateEditorUiState({
      canUndo: !!this.editorHistory?.canUndo && !this.isVideoExporting,
      canRedo: !!this.editorHistory?.canRedo && !this.isVideoExporting,
      exporting: !!this.isVideoExporting,
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
    const duration = Math.max(0.001, this.videoTimeline.duration);
    const width = this.timelineTrackArea.offsetWidth;
    this.timelineView.renderRuler({
      ruler: this.timelineTimeRuler,
      duration,
      width,
    });
  };

  proto.positionTimelineElement = function (el, startTime, endTime = null) {
    const duration = Math.max(0.001, this.videoTimeline.duration);
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
      !this.videoSourceFile ||
      typeof this.videoTimeline.toggleMarker !== 'function'
    )
      return;
    const threshold = 0.08 / Math.max(1, this.timelineZoom);
    this.pushTimelineHistory();
    const result = this.videoTimeline.toggleMarker(
      this.videoEl.currentTime || this.videoTimeline.trimStart,
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
    return ratio * this.videoTimeline.duration;
  };
}

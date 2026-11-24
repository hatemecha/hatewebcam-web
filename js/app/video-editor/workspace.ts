import {
  updateEditorUiState,
  type InspectorTab,
  type SourceMode,
} from '../../../src/lib/editor/editor-state.ts';
import { translateCurrent } from '../../../src/lib/i18n/translate.ts';
import type { TimelineSnapshot } from '../../editor/editor-history.ts';
import { isVisualFxClipType } from '../../editor/timeline-clip-types.ts';
import type { TimelineItem } from '../../editor/video-timeline.ts';
import {
  createDefaultVisualConfig,
  VISUAL_SYSTEM_LABELS,
} from '../../visual-fx/config.ts';
import {
  ADJUST_CONTEXT_HELP,
  ADJUST_CONTEXT_VIDEO_HELP,
  DEFAULT_TIMELINE_EFFECT_DURATION,
  TIMELINE_EFFECT_META,
  TIMELINE_TRACK_COUNT,
  type ImageSettings,
} from '../constants.ts';
import type { Detectors } from '../detectors.ts';
import type { readAppDom } from '../dom.ts';
import { ensureFaceMeshLoaded } from '../face-mesh-loader.ts';
import { hideStatus, showStatus } from '../feedback.ts';
import { formatDurationDetailed } from '../media-format.ts';
import type { WebcamPreferences } from '../webcam-preferences.ts';
import {
  clamp,
  normalizeFaceLabel,
  toFiniteInt,
  type QuickDetectorSettings,
} from '../webcam-settings.ts';
import {
  lookControls,
  normalizeClipAutomation,
  normalizeLookClipConfig,
} from './look-config.ts';
import type { VideoEditorSession } from './session.ts';

type EditorTool = 'select' | 'cut' | 'trim';
type SplitterAxis = 'horizontal' | 'vertical';
type TimelineBounds = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
interface ClipPlacement {
  type: string;
  startTime: number;
  endTime: number;
  edge?: 'move' | 'start' | 'end';
  itemId?: string;
}
interface ClipInsertion {
  type: string;
  anchorTime: number;
  duration?: number;
}
interface AdjustmentOptions {
  syncEffectType?: boolean;
  effectType?: string;
  syncTool?: boolean;
  tool?: 'trim' | 'effect';
}

export interface EditorWorkspaceHost {
  sourceMode: SourceMode;
  imageSettings: ImageSettings;
  quickDetectorSettings: QuickDetectorSettings;
  detectors: Detectors;
  preferences: WebcamPreferences;
}

function targetElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

function effectMeta(type: string | undefined) {
  return type && Object.hasOwn(TIMELINE_EFFECT_META, type)
    ? TIMELINE_EFFECT_META[type as keyof typeof TIMELINE_EFFECT_META]
    : undefined;
}

function visualEffectLabel(system: unknown): string {
  return typeof system === 'string' &&
    Object.hasOwn(VISUAL_SYSTEM_LABELS, system)
    ? VISUAL_SYSTEM_LABELS[system]
    : 'VISUAL FX';
}

export class EditorWorkspace {
  private readonly lifetime = new AbortController();
  private dragListeners: AbortController | null = null;
  selectedVideoEffectId = '';
  selectedVideoEffectIds = new Set<string>();
  timelineZoom = 1;
  timelineHistorySuspended = false;
  timelineClipboard: {
    origin: number;
    items: Pick<TimelineItem, 'type' | 'config' | 'startTime' | 'endTime'>[];
  } | null = null;
  paletteDragState: {
    type: string;
    chip: HTMLButtonElement;
    moved: boolean;
  } | null = null;
  timelineDragGhost: HTMLElement | null = null;
  suppressPaletteClick = false;
  editorTool: EditorTool = 'select';
  inspectorTab: InspectorTab = 'project';
  adjustmentsContext = 'look';
  _adjustClipStatusKey = '';
  adjustClipStatusText = '';
  adjustClipVisible = false;

  constructor(
    private readonly editor: VideoEditorSession,
    private readonly dom: ReturnType<typeof readAppDom>,
    private readonly host: EditorWorkspaceHost,
  ) {}

  dispose() {
    this.lifetime.abort();
    this.cancelInteraction();
    this.clearTimelineItemElements();
    this.removeTimelineDragGhost();
  }

  resolveTimelineClipTimes({
    type,
    startTime,
    endTime,
    edge = 'move',
    itemId = '',
  }: ClipPlacement) {
    const minSpan = 0.05;
    let start = this.roundTimelineTime(startTime);
    let end = this.roundTimelineTime(endTime);
    const span = Math.max(minSpan, end - start);

    if (edge === 'move') {
      start = clamp(
        start,
        this.editor.timeline.trimStart,
        this.editor.timeline.trimEnd - span,
      );
      end = start + span;
    } else if (edge === 'start') {
      start = clamp(start, this.editor.timeline.trimStart, end - minSpan);
    } else {
      end = clamp(end, start + minSpan, this.editor.timeline.trimEnd);
    }

    if (this.dom.chkTimelineSnap?.checked) {
      const threshold = 0.12 / Math.max(1, this.timelineZoom);
      const points = [
        this.editor.timeline.trimStart,
        this.editor.timeline.trimEnd,
        this.dom.videoEl.currentTime || 0,
      ];
      this.editor.timeline.items.forEach((item) => {
        if (item.id === itemId || item.type !== type) return;
        points.push(item.startTime, item.endTime);
      });
      this.editor.timeline.markers?.forEach((marker) =>
        points.push(marker.time),
      );
      let bestDelta = threshold;
      let bestShift = 0;
      for (const point of points) {
        for (const time of edge === 'move'
          ? [start, end]
          : [edge === 'start' ? start : end]) {
          const delta = Math.abs(point - time);
          if (delta < bestDelta) {
            bestDelta = delta;
            bestShift = point - time;
          }
        }
      }
      if (bestShift) {
        if (edge === 'move') {
          start += bestShift;
          end += bestShift;
        } else if (edge === 'start') {
          start += bestShift;
        } else {
          end += bestShift;
        }
      }
    }

    if (edge === 'move') {
      start = clamp(
        start,
        this.editor.timeline.trimStart,
        this.editor.timeline.trimEnd - span,
      );
      end = start + span;
    } else {
      start = clamp(
        start,
        this.editor.timeline.trimStart,
        this.editor.timeline.trimEnd - minSpan,
      );
      end = clamp(end, start + minSpan, this.editor.timeline.trimEnd);
    }
    return {
      startTime: this.roundTimelineTime(start),
      endTime: this.roundTimelineTime(end),
    };
  }

  getTimelineIntervalPoints() {
    const points = [
      this.editor.timeline.trimStart,
      this.editor.timeline.trimEnd,
      ...(this.editor.timeline.markers || []).map((marker) => marker.time),
    ]
      .filter(
        (time) =>
          Number.isFinite(Number(time)) &&
          time >= this.editor.timeline.trimStart &&
          time <= this.editor.timeline.trimEnd,
      )
      .sort((a, b) => a - b);
    return [...new Set(points.map((time) => this.roundTimelineTime(time)))];
  }

  resolveTimelineInsertionTimes({
    type,
    anchorTime,
    duration = DEFAULT_TIMELINE_EFFECT_DURATION,
  }: ClipInsertion) {
    const minSpan = 0.05;
    const points = this.getTimelineIntervalPoints();
    if (points.length >= 3) {
      const time = this.snapTimelineTime(anchorTime);
      const index = points.findIndex(
        (point, pointIndex) => time >= point && time < points[pointIndex + 1],
      );
      const startIndex = index === -1 ? points.length - 2 : index;
      const startTime = points[startIndex];
      const endTime = points[startIndex + 1];
      if (endTime - startTime >= minSpan) return { startTime, endTime };
    }
    const span = Math.max(
      minSpan,
      Math.min(
        duration,
        this.editor.timeline.trimEnd - this.editor.timeline.trimStart,
      ),
    );
    return this.resolveTimelineClipTimes({
      type,
      startTime: anchorTime,
      endTime: anchorTime + span,
      edge: 'move',
    });
  }

  async addTimelineEffectClip(
    type: string | undefined,
    anchorTime: number,
    duration = DEFAULT_TIMELINE_EFFECT_DURATION,
  ) {
    const meta = effectMeta(type);
    if (!type || !this.editor.source?.file || !meta) return null;
    const placed = this.resolveTimelineInsertionTimes({
      type,
      anchorTime,
      duration,
    });
    const { startTime, endTime } = placed;
    if (endTime <= startTime) {
      showStatus(
        this.dom.videoEditorStatus,
        translateCurrent('No hay espacio libre en esa pista.'),
        'error',
      );
      return null;
    }
    try {
      this.pushTimelineHistory();
      const saved = this.editor.timeline.upsert({
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
        type,
        startTime,
        endTime,
        config: this.snapshotVideoEffectConfig(type),
      });
      if (type === 'face' || type === 'blink') {
        try {
          await ensureFaceMeshLoaded();
        } catch (err) {
          console.warn('Detector preload failed:', err);
        }
      }
      if (isVisualFxClipType(type)) await this.editor.visualFx?.ensureEffect();
      this.selectVideoEffect(saved.id);
      void this.editor?.timelineEffects.sync(true);
      showStatus(
        this.dom.videoEditorStatus,
        `${translateCurrent(meta.label)} ${translateCurrent('agregado.')}`,
        'success',
      );
      setTimeout(() => hideStatus(this.dom.videoEditorStatus), 1200);
      this.setInspectorTab('adjust');
      return saved;
    } catch (err) {
      showStatus(
        this.dom.videoEditorStatus,
        err instanceof Error ? err.message : String(err),
        'error',
      );
      return null;
    }
  }

  selectVideoEffect(id: string) {
    this.syncLookClipConfigNow();
    this.selectedVideoEffectId = id || '';
    this.selectedVideoEffectIds = new Set(id ? [id] : []);
    const item = this.editor.timeline.items.find(
      (candidate) => candidate.id === this.selectedVideoEffectId,
    );
    if (item) {
      this.dom.videoEffectType.value = item.type;
      this.dom.videoEffectStart.value = item.startTime.toFixed(2);
      this.dom.videoEffectEnd.value = item.endTime.toFixed(2);
      this.applyVideoEffectItemConfig(item);
      if (isVisualFxClipType(item.type)) {
        const t = this.dom.videoEl?.currentTime || 0;
        if (t < item.startTime || t >= item.endTime) {
          void this.editor.transport.seek(
            Math.min(item.endTime - 0.05, item.startTime + 0.05),
          );
        }
      }
    }
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    this.updateEffectTrackHighlight();
    this.updateTimelineHint();
    if (item) this.setInspectorTab('effect');
  }

  snapTimelineTime(time: number) {
    if (!this.dom.chkTimelineSnap?.checked) return time;
    const points = new Set([
      this.editor.timeline.trimStart,
      this.editor.timeline.trimEnd,
      this.dom.videoEl.currentTime || 0,
    ]);
    if (typeof this.editor.timeline.getSnapPoints === 'function') {
      this.editor.timeline
        .getSnapPoints()
        .forEach((point) => points.add(point));
    } else {
      this.editor.timeline.items.forEach((item) => {
        points.add(item.startTime);
        points.add(item.endTime);
      });
      this.editor.timeline.markers?.forEach((marker) =>
        points.add(marker.time),
      );
    }
    let closest = time;
    let minDelta = 0.12 / Math.max(1, this.timelineZoom);
    points.forEach((point) => {
      const delta = Math.abs(point - time);
      if (delta < minDelta) {
        minDelta = delta;
        closest = point;
      }
    });
    return closest;
  }

  renderVideoTimeline() {
    if (
      !this.dom.timelineItems ||
      !this.dom.videoTimelineEl ||
      !this.dom.timelineTrackArea
    )
      return;
    this.dom.videoTimelineEl.style.setProperty(
      '--timeline-track-count',
      String(this.getTimelineTrackCount()),
    );
    const duration = Math.max(0.001, this.editor.timeline.duration);
    const percent = (time: number) =>
      `${clamp((time / duration) * 100, 0, 100)}%`;

    if (this.dom.timelineVideoClip) {
      this.dom.timelineVideoClip.style.left = '0';
      this.dom.timelineVideoClip.style.width = '100%';
    }
    this.dom.timelineTrim.style.left = percent(this.editor.timeline.trimStart);
    this.dom.timelineTrim.style.width = percent(
      this.editor.timeline.trimEnd - this.editor.timeline.trimStart,
    );
    this.dom.timelineTrimStartHandle.style.left = percent(
      this.editor.timeline.trimStart,
    );
    this.dom.timelineTrimEndHandle.style.left = percent(
      this.editor.timeline.trimEnd,
    );
    if (this.dom.timelineTrimOutsideStart) {
      this.dom.timelineTrimOutsideStart.style.width = percent(
        this.editor.timeline.trimStart,
      );
    }
    if (this.dom.timelineTrimOutsideEnd) {
      this.dom.timelineTrimOutsideEnd.style.left = percent(
        this.editor.timeline.trimEnd,
      );
      this.dom.timelineTrimOutsideEnd.style.width = percent(
        duration - this.editor.timeline.trimEnd,
      );
    }

    const selectionStart = this.selectedVideoEffectId
      ? clamp(
          Number(this.dom.videoEffectStart.value) || 0,
          this.editor.timeline.trimStart,
          this.editor.timeline.trimEnd,
        )
      : this.dom.videoEl.currentTime || 0;
    const selectionEnd = this.selectedVideoEffectId
      ? clamp(
          Number(this.dom.videoEffectEnd.value) || 0,
          selectionStart,
          this.editor.timeline.trimEnd,
        )
      : selectionStart;
    if (this.selectedVideoEffectId) {
      this.dom.videoEffectStart.value = selectionStart.toFixed(2);
      this.dom.videoEffectEnd.value = selectionEnd.toFixed(2);
    }
    if (this.dom.videoEffectRangeLabel) {
      if (this.selectedVideoEffectId) {
        this.dom.videoEffectRangeLabel.textContent = `${formatDurationDetailed(selectionStart)} - ${formatDurationDetailed(selectionEnd)}`;
      } else {
        this.dom.videoEffectRangeLabel.textContent = `Cursor: ${formatDurationDetailed(this.dom.videoEl.currentTime || 0)}`;
      }
    }
    this.dom.timelinePlayhead.style.left = percent(
      this.dom.videoEl.currentTime || 0,
    );

    const { timelineMarkers } = this.dom;
    if (timelineMarkers) {
      timelineMarkers.innerHTML = '';
      (this.editor.timeline.markers || []).forEach((marker) => {
        const markerEl = document.createElement('button');
        markerEl.type = 'button';
        markerEl.className = 'timeline-marker';
        markerEl.dataset.id = marker.id;
        markerEl.dataset.kind = marker.kind || 'manual';
        markerEl.dataset.source = marker.source || 'user';
        markerEl.style.left = percent(marker.time);
        markerEl.title = `${marker.label || 'Marcador'} ${formatDurationDetailed(marker.time)}`;
        markerEl.setAttribute('aria-label', markerEl.title);
        markerEl.addEventListener('click', (event) => {
          event.stopPropagation();
          this.editor.transport.seek(marker.time);
        });
        timelineMarkers.appendChild(markerEl);
      });
    }

    this.clearTimelineItemElements();
    this.editor.timeline.items.forEach((item) => {
      const meta = effectMeta(item.type) || {
        trackLabel: item.type,
        row: 1,
      };
      const el = document.createElement('div');
      const selectedIds = this.selectedVideoEffectIds || new Set();
      el.className = `timeline-item${item.id === this.selectedVideoEffectId || selectedIds.has(item.id) ? ' is-selected' : ''}`;
      el.dataset.id = item.id;
      el.dataset.type = item.type;
      const label = isVisualFxClipType(item.type)
        ? visualEffectLabel(item.config.system)
        : meta.trackLabel;
      el.innerHTML = `
        <span class="timeline-item-handle start" aria-hidden="true"></span>
        <span class="timeline-item-label">${label}</span>
        <span class="timeline-item-handle end" aria-hidden="true"></span>
      `;
      this.appendTimelineClip(el, item.type);
      this.positionTimelineRowElement(
        el,
        item.startTime,
        item.endTime,
        meta.row,
      );
      el.addEventListener('pointerdown', (event) =>
        this.beginTimelineDrag(event, item, el),
      );
    });
    this.renderTimelineRuler();
    this.updateEffectTrackHighlight();
    this.editor.editAssist?.updateUI();
  }

  getSelectedVideoEffectItems() {
    const ids = this.selectedVideoEffectIds?.size
      ? this.selectedVideoEffectIds
      : new Set(this.selectedVideoEffectId ? [this.selectedVideoEffectId] : []);
    return this.editor.timeline.items.filter((item) => ids.has(item.id));
  }

  deleteSelectedVideoEffect() {
    const items = this.getSelectedVideoEffectItems();
    if (!items.length) return;
    this.pushTimelineHistory();
    items.forEach((item) => this.editor.timeline.remove(item.id));
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    void this.editor?.timelineEffects.sync(true);
  }

  copySelectedVideoEffects(cut = false) {
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
  }

  pasteVideoEffects(settingsOnly = false) {
    const clipboard = this.timelineClipboard;
    if (!clipboard?.items.length || !this.editor.source.file) return;
    const selectedItems = this.getSelectedVideoEffectItems();
    if (settingsOnly) {
      if (!selectedItems.length) return;
      const snapshot =
        this.editor.history?.snapshot?.(this.editor.timeline) || null;
      let applied = 0;
      selectedItems.forEach((item) => {
        const source =
          clipboard.items.find((clip) => clip.type === item.type) ||
          clipboard.items[0];
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
      void this.editor?.timelineEffects.sync(true);
      return;
    }

    const anchor = clamp(
      this.dom.videoEl.currentTime || this.editor.timeline.trimStart,
      this.editor.timeline.trimStart,
      this.editor.timeline.trimEnd,
    );
    const newIds: string[] = [];
    // Paste is all or nothing: a clip that lands outside the trim used to
    // leave the earlier ones applied plus a history entry.
    const snapshot =
      this.editor.history?.snapshot?.(this.editor.timeline) || null;
    try {
      clipboard.items.forEach((clip) => {
        const offset = clip.startTime - clipboard.origin;
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
      void this.editor?.timelineEffects.sync(true);
    } catch (err) {
      if (snapshot && this.editor.history) {
        this.editor.history.restore(this.editor.timeline, snapshot);
        this.renderVideoTimeline();
        this.updateVideoEffectInspector();
      }
      showStatus(
        this.dom.videoEditorStatus,
        err instanceof Error ? err.message : String(err),
        'error',
      );
    }
  }

  applyVideoTrim(resetSelection = true) {
    if (!this.editor.source?.file) return;
    try {
      this.editor.timeline.setTrim(
        this.dom.videoTrimStart.value,
        this.dom.videoTrimEnd.value,
      );
      this.dom.videoEl.currentTime = clamp(
        this.dom.videoEl.currentTime,
        this.editor.timeline.trimStart,
        this.editor.timeline.trimEnd,
      );
      if (resetSelection) {
        this.dom.videoEffectStart.value =
          this.editor.timeline.trimStart.toFixed(2);
        this.dom.videoEffectEnd.value = this.editor.timeline.trimEnd.toFixed(2);
      }
      this.renderVideoTimeline();
      this.editor.exporter.updateVideoEditorUI();
    } catch (err) {
      this.dom.videoTrimStart.value = this.editor.timeline.trimStart.toFixed(2);
      this.dom.videoTrimEnd.value = this.editor.timeline.trimEnd.toFixed(2);
      showStatus(
        this.dom.videoEditorStatus,
        err instanceof Error ? err.message : String(err),
        'error',
      );
    }
  }

  getSelectedVideoEffectItem() {
    return (
      this.editor.timeline.items.find(
        (candidate) => candidate.id === this.selectedVideoEffectId,
      ) || null
    );
  }

  isPlayheadInSelectedClip() {
    const item = this.getSelectedVideoEffectItem();
    if (!item || !this.editor.source?.file) return false;
    const time = this.dom.videoEl.currentTime || 0;
    return time >= item.startTime && time < item.endTime;
  }

  applyClipConfigToQuickSettings(item: TimelineItem) {
    if (!item?.config) return;
    if (item.type === 'blob') {
      if (typeof item.config.boxColor === 'string' && item.config.boxColor)
        this.host.quickDetectorSettings.blobBoxColor = item.config.boxColor;
      return;
    }
    if (item.type === 'face') {
      const config = item.config;
      if (typeof config.boxColor === 'string' && config.boxColor)
        this.host.quickDetectorSettings.faceBoxColor = config.boxColor;
      if (config.labelText != null)
        this.host.quickDetectorSettings.faceLabelText = normalizeFaceLabel(
          config.labelText,
        );
      if (config.showBox != null)
        this.host.quickDetectorSettings.faceShowBox = !!config.showBox;
      if (config.showBlur != null)
        this.host.quickDetectorSettings.faceShowBlur = !!config.showBlur;
      if (config.pixelationCellSize != null) {
        this.host.quickDetectorSettings.facePixelationCellSize = clamp(
          toFiniteInt(
            config.pixelationCellSize,
            this.host.quickDetectorSettings.facePixelationCellSize,
          ),
          4,
          48,
        );
      }
      if (config.censorPaddingPercent != null) {
        this.host.quickDetectorSettings.faceCensorPaddingPercent = clamp(
          toFiniteInt(
            config.censorPaddingPercent,
            this.host.quickDetectorSettings.faceCensorPaddingPercent,
          ),
          0,
          48,
        );
      }
    }
  }

  updateAdjustmentsClipStatus() {
    if (!this.dom.adjustClipStatus || this.host.sourceMode !== 'video') return;
    const item = this.getSelectedVideoEffectItem();
    if (!item) {
      if (this._adjustClipStatusKey !== 'empty') {
        this._adjustClipStatusKey = 'empty';
        this.dom.adjustClipStatus.classList.add('hidden');
        this.dom.adjustClipStatus.classList.remove('is-live');
        this.adjustClipStatusText = '';
        this.adjustClipVisible = false;
        this.host.preferences?.publishWebcamPanel();
      }
      return;
    }
    const active = this.isPlayheadInSelectedClip();
    // This runs every render tick while a clip is selected; the underlying
    // state (item id + in/out-of-clip) only actually changes occasionally,
    // so skip the textContent/classList writes otherwise.
    const key = `${item.id}:${item.startTime}:${item.endTime}:${active}`;
    if (this._adjustClipStatusKey === key) return;
    this._adjustClipStatusKey = key;
    this.adjustClipStatusText = active
      ? `${translateCurrent('Tramo')} ${formatDurationDetailed(item.startTime)} - ${formatDurationDetailed(item.endTime)} · ${translateCurrent('Vista previa activa')}`
      : `${translateCurrent('Tramo')} ${formatDurationDetailed(item.startTime)} - ${formatDurationDetailed(item.endTime)} · ${translateCurrent('Mové el cursor al clip para previsualizar')}`;
    this.adjustClipVisible = true;
    this.dom.adjustClipStatus.textContent = this.adjustClipStatusText;
    this.dom.adjustClipStatus.classList.toggle('is-live', active);
    this.dom.adjustClipStatus.classList.remove('hidden');
    this.host.preferences?.publishWebcamPanel();
  }

  updateAdjustmentsPanelState() {
    const hasVideo = !!this.editor.source?.file;
    const item = this.getSelectedVideoEffectItem();
    const hasSelection = !!item;
    const isVisualFx = isVisualFxClipType(item?.type ?? '');
    if (this.dom.inspectorAdjustNoVideo)
      this.dom.inspectorAdjustNoVideo.classList.toggle('hidden', hasVideo);
    if (this.dom.inspectorAdjustNoClip)
      this.dom.inspectorAdjustNoClip.classList.toggle(
        'hidden',
        !hasVideo || hasSelection,
      );
    if (this.dom.inspectorAdjustmentsHost) {
      this.dom.inspectorAdjustmentsHost.classList.toggle(
        'hidden',
        !hasSelection,
      );
      this.dom.inspectorAdjustmentsHost.classList.toggle(
        'is-visual-fx',
        isVisualFx,
      );
    }
    if (this.dom.adjustContextNav)
      this.dom.adjustContextNav.classList.toggle(
        'hidden',
        !hasSelection || isVisualFx,
      );
    if (this.dom.effectsControlsSlot)
      this.dom.effectsControlsSlot.classList.toggle('hidden', isVisualFx);
    if (this.dom.adjustContextHelp)
      this.dom.adjustContextHelp.classList.toggle('hidden', isVisualFx);
    if (this.dom.adjustClipStatus)
      this.dom.adjustClipStatus.classList.toggle('hidden', isVisualFx);
    if (hasSelection) this.updateAdjustmentsContext();
    if (isVisualFx) this.editor.visualFx?.updateInspector();
  }

  getSelectedAutomationMode() {
    return normalizeClipAutomation(this.dom.videoEffectAutomationSelect?.value);
  }

  syncLookClipConfigNow() {
    if (this.host.sourceMode !== 'video' || !this.selectedVideoEffectId) return;
    const item = this.editor.timeline.items.find(
      (candidate) => candidate.id === this.selectedVideoEffectId,
    );
    if (!item || item.type !== 'look') return;
    try {
      this.editor.timeline.upsert({
        ...item,
        config: this.snapshotVideoEffectConfig('look'),
      });
    } catch (err) {
      console.warn(
        'No se pudo guardar el look del clip:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  snapshotVideoEffectConfig(type: string) {
    if (type === 'look') {
      return {
        ...normalizeLookClipConfig({ ...this.host.imageSettings }),
        automation: this.getSelectedAutomationMode(),
      };
    }
    if (type === 'blob') {
      const config = this.host.detectors.blob
        ? this.host.detectors.blob.getConfig()
        : {
            boxColor: this.host.quickDetectorSettings.blobBoxColor,
          };
      return { ...config, automation: this.getSelectedAutomationMode() };
    }
    if (type === 'face') {
      const config = this.host.detectors.face
        ? this.host.detectors.face.getConfig()
        : {
            boxColor: this.host.quickDetectorSettings.faceBoxColor,
            labelText: this.host.quickDetectorSettings.faceLabelText,
            showBox: this.host.quickDetectorSettings.faceShowBox,
            showBlur: this.host.quickDetectorSettings.faceShowBlur,
            visualMode: this.host.preferences.getFaceVisualMode(),
            pixelationCellSize:
              this.host.quickDetectorSettings.facePixelationCellSize,
            censorPaddingPercent:
              this.host.quickDetectorSettings.faceCensorPaddingPercent,
          };
      return { ...config, automation: this.getSelectedAutomationMode() };
    }
    if (isVisualFxClipType(type)) {
      return { ...createDefaultVisualConfig('recursive') };
    }
    return {
      ...(this.host.detectors.blink
        ? this.host.detectors.blink.getConfig()
        : {}),
      automation: this.getSelectedAutomationMode(),
    };
  }

  applyVideoEffectItemConfig(item: TimelineItem) {
    if (!item?.config) return;
    if (item.type === 'look') {
      const look = normalizeLookClipConfig({
        ...this.host.imageSettings,
        ...item.config,
      });
      for (const key of lookControls) this.host.imageSettings[key] = look[key];
      this.host.imageSettings.blackAndWhite = look.blackAndWhite;
      this.host.preferences.updateImageControlsUI();
      this.host.preferences.saveImageSettings();
      return;
    }
    if (item.type === 'blob') {
      if (this.host.detectors.blob)
        this.host.detectors.blob.setConfig(item.config);
      else this.applyClipConfigToQuickSettings(item);
    } else if (item.type === 'face') {
      if (this.host.detectors.face)
        this.host.detectors.face.setConfig(item.config);
      else this.applyClipConfigToQuickSettings(item);
    } else if (item.type === 'blink' && this.host.detectors.blink) {
      this.host.detectors.blink.setConfig(item.config);
    } else if (isVisualFxClipType(item.type)) {
      this.editor.visualFx?.setEffectConfig(item.config);
      this.editor.visualFx?.updateInspector();
    }
    this.host.preferences.syncQuickDetectorSettingsFromEffects();
    this.host.preferences.updateQuickDetectorControlsUI();
  }

  commitSelectedEffectTiming(options: { pushHistory?: boolean } = {}) {
    if (!this.selectedVideoEffectId) return;
    const item = this.editor.timeline.items.find(
      (candidate) => candidate.id === this.selectedVideoEffectId,
    );
    if (!item) return;
    const minSpan = 0.05;
    const startTime = clamp(
      Number(this.dom.videoEffectStart.value) || 0,
      this.editor.timeline.trimStart,
      this.editor.timeline.trimEnd - minSpan,
    );
    const endTime = clamp(
      Number(this.dom.videoEffectEnd.value) || 0,
      startTime + minSpan,
      this.editor.timeline.trimEnd,
    );
    this.dom.videoEffectStart.value = startTime.toFixed(2);
    this.dom.videoEffectEnd.value = endTime.toFixed(2);
    try {
      if (options.pushHistory) this.pushTimelineHistory();
      this.editor.timeline.upsert({ ...item, startTime, endTime });
      this.renderVideoTimeline();
      void this.editor?.timelineEffects.sync(true);
    } catch (err) {
      showStatus(
        this.dom.videoEditorStatus,
        err instanceof Error ? err.message : String(err),
        'error',
      );
      this.selectVideoEffect(item.id);
    }
  }

  roundTimelineTime(time: unknown) {
    return Math.round((Number(time) || 0) * 1000) / 1000;
  }

  getTimelineRowFromClientY(clientY: number) {
    if (!this.dom.timelineTrackArea) return null;
    const bounds = this.dom.timelineTrackArea.getBoundingClientRect();
    if (clientY < bounds.top || clientY > bounds.bottom) return null;
    const ratio = clamp((clientY - bounds.top) / bounds.height, 0, 0.999);
    const row = Math.floor(ratio * this.getTimelineTrackCount());
    if (row <= 0) return null;
    return (
      Object.entries(TIMELINE_EFFECT_META).find(
        ([, meta]) => meta.row === row,
      )?.[0] || null
    );
  }

  clearTimelineDropTargets() {
    this.dom.videoTimelineEl
      ?.querySelectorAll('.timeline-track-effects.is-drop-target')
      .forEach((track) => {
        track.classList.remove('is-drop-target');
      });
  }

  setTimelineDropTarget(type: string | null) {
    this.clearTimelineDropTargets();
    if (!type || !this.dom.videoTimelineEl) return;
    const track = this.dom.videoTimelineEl.querySelector(
      `.timeline-track-effects[data-track="${type}"]`,
    );
    track?.classList.add('is-drop-target');
  }

  updateTimelineDragGhost(
    clientX: number,
    clientY: number,
    label: string,
    type: string | null = null,
  ) {
    this.timelineDragGhost = this.editor.timelineView.ensureDragGhost(
      document.body,
    );
    this.timelineDragGhost.textContent = label;
    this.timelineDragGhost.dataset.type = type || '';
    const rowType = this.getTimelineRowFromClientY(clientY);
    if (type && rowType && this.dom.timelineTrackArea) {
      const bounds = this.dom.timelineTrackArea.getBoundingClientRect();
      const rawTime = this.getTimelineRawTime(clientX);
      const { startTime, endTime } = this.resolveTimelineInsertionTimes({
        type,
        anchorTime: rawTime,
        duration: DEFAULT_TIMELINE_EFFECT_DURATION,
      });
      const duration = Math.max(0.001, this.editor.timeline.duration);
      const row = effectMeta(type)?.row || 1;
      const rowSize = bounds.height / this.getTimelineTrackCount();
      this.timelineDragGhost.classList.add('is-timeline-preview');
      this.timelineDragGhost.style.left = `${bounds.left + (startTime / duration) * bounds.width}px`;
      this.timelineDragGhost.style.top = `${bounds.top + row * rowSize}px`;
      this.timelineDragGhost.style.width = `${Math.max(12, ((endTime - startTime) / duration) * bounds.width)}px`;
      this.timelineDragGhost.style.height = `${rowSize}px`;
      return;
    }
    this.timelineDragGhost.classList.remove('is-timeline-preview');
    this.timelineDragGhost.style.left = `${clientX}px`;
    this.timelineDragGhost.style.top = `${clientY}px`;
    this.timelineDragGhost.style.width = '';
    this.timelineDragGhost.style.height = '';
  }

  removeTimelineDragGhost() {
    this.editor.timelineView.removeDragGhost();
    this.timelineDragGhost = null;
  }

  finishPaletteDrag(event: PointerEvent) {
    if (!this.paletteDragState) return;
    const chip = this.paletteDragState.chip;
    chip?.classList.remove('is-dragging');
    if (chip?.hasPointerCapture?.(event.pointerId))
      chip.releasePointerCapture(event.pointerId);
    const type = this.paletteDragState.type;
    const moved = this.paletteDragState.moved;
    this.paletteDragState = null;
    this.removeTimelineDragGhost();
    this.clearTimelineDropTargets();
    this.updateEffectTrackHighlight();
    if (moved) {
      this.suppressPaletteClick = true;
      setTimeout(() => {
        this.suppressPaletteClick = false;
      }, 0);
    }
    if (!moved || !this.editor.source?.file) return;
    if (!this.getTimelineRowFromClientY(event.clientY)) {
      showStatus(
        this.dom.videoEditorStatus,
        'Soltá el efecto sobre la timeline.',
        'warning',
      );
      setTimeout(() => hideStatus(this.dom.videoEditorStatus), 1800);
      return;
    }
    void this.addTimelineEffectClip(type, this.getTimelineTime(event.clientX));
  }

  bindTimelinePaletteDrag() {
    const { signal } = this.lifetime;
    if (!this.dom.timelineEffectPalette) return;
    this.dom.timelineEffectPalette
      .querySelectorAll<HTMLButtonElement>('.timeline-palette-chip')
      .forEach((chip) => {
        chip.addEventListener(
          'click',
          (event) => {
            if (
              this.suppressPaletteClick ||
              !this.editor.source?.file ||
              this.editor.exportSession?.active ||
              chip.disabled
            )
              return;
            event.preventDefault();
            void this.addTimelineEffectClip(
              chip.dataset.effectType,
              this.dom.videoEl.currentTime || this.editor.timeline.trimStart,
            );
          },
          { signal },
        );
        chip.addEventListener(
          'pointerdown',
          (event) => {
            if (
              !this.editor.source?.file ||
              this.editor.exportSession?.active ||
              event.button !== 0 ||
              chip.disabled
            )
              return;
            event.preventDefault();
            const type = chip.dataset.effectType;
            const meta = effectMeta(type);
            if (!type || !meta) return;
            this.paletteDragState = { type, chip, moved: false };
            chip.classList.add('is-dragging');
            chip.setPointerCapture(event.pointerId);
            this.updateTimelineDragGhost(
              event.clientX,
              event.clientY,
              meta.label,
              type,
            );
            this.setTimelineDropTarget(type);
          },
          { signal },
        );
        chip.addEventListener(
          'pointermove',
          (event) => {
            if (!this.paletteDragState || this.paletteDragState.chip !== chip)
              return;
            this.paletteDragState.moved = true;
            this.updateTimelineDragGhost(
              event.clientX,
              event.clientY,
              effectMeta(this.paletteDragState.type)?.label ??
                this.paletteDragState.type,
              this.paletteDragState.type,
            );
            const rowType = this.getTimelineRowFromClientY(event.clientY);
            this.setTimelineDropTarget(
              rowType ? this.paletteDragState.type : null,
            );
          },
          { signal },
        );
        chip.addEventListener('pointerup', this.finishPaletteDrag.bind(this), {
          signal,
        });
        chip.addEventListener(
          'pointercancel',
          this.finishPaletteDrag.bind(this),
          { signal },
        );
        chip.addEventListener('dragstart', (event) => event.preventDefault(), {
          signal,
        });
      });

    this.dom.videoTimelineEl
      ?.querySelectorAll<HTMLElement>('.timeline-track-effects')
      .forEach((track) => {
        track.addEventListener(
          'dblclick',
          (event) => {
            if (
              !this.editor.source?.file ||
              targetElement(event)?.closest('.timeline-item')
            )
              return;
            event.preventDefault();
            void this.addTimelineEffectClip(
              track.dataset.track,
              this.dom.videoEl.currentTime || this.editor.timeline.trimStart,
            );
          },
          { signal },
        );
      });
  }

  toggleVideoEffectSelection(id: string) {
    if (!id) return;
    this.selectedVideoEffectIds ||= new Set();
    if (this.selectedVideoEffectIds.has(id))
      this.selectedVideoEffectIds.delete(id);
    else this.selectedVideoEffectIds.add(id);
    this.selectedVideoEffectId = this.selectedVideoEffectIds.has(id)
      ? id
      : this.selectedVideoEffectIds.values().next().value || '';
    if (this.selectedVideoEffectId) {
      const item = this.editor.timeline.items.find(
        (candidate) => candidate.id === this.selectedVideoEffectId,
      );
      if (item) {
        this.dom.videoEffectType.value = item.type;
        this.dom.videoEffectStart.value = item.startTime.toFixed(2);
        this.dom.videoEffectEnd.value = item.endTime.toFixed(2);
      }
    }
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    this.updateEffectTrackHighlight();
  }

  selectVideoEffectsByType(type: string) {
    if (!type || !this.editor.source?.file) return;
    const ids = this.editor.timeline.items
      .filter((item) => item.type === type)
      .map((item) => item.id);
    if (!ids.length) return;
    this.selectedVideoEffectIds = new Set(ids);
    this.selectedVideoEffectId = ids[0];
    const item = this.getSelectedVideoEffectItem();
    if (item) {
      this.dom.videoEffectType.value = item.type;
      this.dom.videoEffectStart.value = item.startTime.toFixed(2);
      this.dom.videoEffectEnd.value = item.endTime.toFixed(2);
      this.applyVideoEffectItemConfig(item);
    }
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    this.updateEffectTrackHighlight();
    this.setInspectorTab('effect');
  }

  selectAllVideoEffects() {
    this.selectedVideoEffectIds = new Set(
      this.editor.timeline.items.map((item) => item.id),
    );
    this.selectedVideoEffectId = this.editor.timeline.items[0]?.id || '';
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    this.updateEffectTrackHighlight();
  }

  updateVideoEffectInspector() {
    const hasVideo = !!this.editor.source?.file;
    const item = this.editor.timeline.items.find(
      (candidate) => candidate.id === this.selectedVideoEffectId,
    );
    const editing = !!item;
    if (this.dom.videoEffectEmptyNoVideo)
      this.dom.videoEffectEmptyNoVideo.classList.toggle('hidden', hasVideo);
    if (this.dom.videoEffectEmptyHint)
      this.dom.videoEffectEmptyHint.classList.toggle(
        'hidden',
        !hasVideo || editing,
      );
    if (this.dom.videoEffectClipMeta)
      this.dom.videoEffectClipMeta.classList.toggle('hidden', !editing);
    if (item && this.dom.videoEffectTypeLabel) {
      this.dom.videoEffectTypeLabel.textContent = `${effectMeta(item.type)?.trackLabel || item.type} · ${effectMeta(item.type)?.label || item.type}`;
    }
    if (item && this.dom.videoEffectDurationLabel) {
      const duration = Math.max(0, item.endTime - item.startTime);
      this.dom.videoEffectDurationLabel.textContent = `${translateCurrent('Duración')}: ${duration.toFixed(2)} s`;
    }
    if (this.dom.videoEffectAutomationSelect) {
      this.dom.videoEffectAutomationSelect.disabled = !editing;
      this.dom.videoEffectAutomationSelect.value = normalizeClipAutomation(
        item?.config?.automation,
      );
    }
    if (this.dom.btnDeleteVideoEffect)
      this.dom.btnDeleteVideoEffect.disabled = !editing;
    if (this.dom.btnOpenEffectAdjust)
      this.dom.btnOpenEffectAdjust.disabled = !editing;
    this.editor.visualFx?.updateInspector();
  }

  commitSelectedEffectAutomation() {
    const item = this.getSelectedVideoEffectItem();
    if (!item) return;
    this.pushTimelineHistory();
    this.editor.timeline.upsert({
      ...item,
      config: {
        ...(item.config || {}),
        automation: this.getSelectedAutomationMode(),
      },
    });
    this.renderVideoTimeline();
    void this.editor?.timelineEffects.sync(true);
  }

  updateTimelineClipboardStatus(message = '') {
    if (!this.dom.timelineClipboardStatus) return;
    this.dom.timelineClipboardStatus.textContent = message;
    this.dom.timelineClipboardStatus.classList.toggle('is-active', !!message);
  }

  mountVideoEffectsControls() {
    if (!this.dom.effectsControlsSlot || !this.dom.inspectorAdjustmentsHost)
      return;
    if (
      this.dom.effectsControlsSlot.parentElement !==
      this.dom.inspectorAdjustmentsHost
    ) {
      this.dom.inspectorAdjustmentsHost.appendChild(
        this.dom.effectsControlsSlot,
      );
    }
    this.dom.effectsControlsSlot.classList.add('is-contextual');
    this.host.preferences?.publishWebcamPanel();
    this.host.preferences.setAdvancedOptionsVisible(true);
    this.updateAdjustmentsPanelState();
  }

  unmountVideoEffectsControls() {
    if (!this.dom.effectsControlsSlot || !this.dom.controlPanel) return;
    this.dom.effectsControlsSlot.classList.remove('is-contextual');
    this.host.preferences?.publishWebcamPanel();
    delete this.dom.effectsControlsSlot.dataset.adjustContext;
    this.dom.adjustContextNav?.classList.add('hidden');
    this.dom.effectsControlsSlot
      .querySelectorAll<HTMLElement>('.adjust-context-group')
      .forEach((group) => {
        group.classList.remove('is-active');
      });
    this.dom.videoTimelineEl
      ?.querySelectorAll<HTMLElement>(
        '.timeline-track-label[data-adjust-context]',
      )
      .forEach((label) => {
        label.classList.remove('is-active');
      });
    const cfg = this.host.preferences.loadConfig();
    this.host.preferences.setAdvancedOptionsVisible(!!cfg.showAdvancedOptions);
    const sourceSection = this.dom.controlPanel.querySelector('#sourcePanel');
    if (
      sourceSection &&
      this.dom.effectsControlsSlot.parentElement !== this.dom.controlPanel
    ) {
      sourceSection.insertAdjacentElement(
        'afterend',
        this.dom.effectsControlsSlot,
      );
    }
  }

  resolveAdjustmentsContext() {
    const selected = this.getSelectedVideoEffectItem();
    if (selected) return selected.type;
    return 'look';
  }

  setAdjustmentsContext(
    context: string | undefined,
    options: AdjustmentOptions = {},
  ) {
    if (!this.getSelectedVideoEffectItem()) return;
    if (context === 'video') context = 'look';
    if (!context || !Object.hasOwn(ADJUST_CONTEXT_HELP, context)) return;
    const contextKey = context as keyof typeof ADJUST_CONTEXT_HELP;
    this.adjustmentsContext = context;
    if (this.dom.effectsControlsSlot) {
      this.dom.effectsControlsSlot.dataset.adjustContext = context;
    }
    this.dom.adjustContextNav
      ?.querySelectorAll<HTMLElement>('.adjust-context-tab')
      .forEach((tab) => {
        const active = tab.dataset.adjustContext === context;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
    this.dom.effectsControlsSlot
      ?.querySelectorAll<HTMLElement>('.adjust-context-group')
      .forEach((group) => {
        group.classList.toggle(
          'is-active',
          group.dataset.adjustContext === context,
        );
      });
    this.dom.videoTimelineEl
      ?.querySelectorAll<HTMLElement>(
        '.timeline-track-label[data-adjust-context]',
      )
      .forEach((label) => {
        label.classList.toggle(
          'is-active',
          label.dataset.adjustContext === context,
        );
      });
    if (this.dom.adjustContextHelp) {
      const help =
        ADJUST_CONTEXT_VIDEO_HELP[contextKey] ||
        ADJUST_CONTEXT_HELP[contextKey];
      this.dom.adjustContextHelp.textContent = translateCurrent(help);
    }
    this.updateAdjustmentsClipStatus();
    this.host.preferences?.publishWebcamPanel();
    if (options.syncEffectType && this.dom.videoEffectType) {
      this.dom.videoEffectType.value = options.effectType || context;
      this.updateEffectTrackHighlight();
      this.updateTimelineHint();
    }
    if (options.syncTool) {
      if (options.tool === 'trim') {
        this.setEditorTool('trim');
      } else if (options.tool === 'effect') {
        this.setEditorTool('select');
        if (this.dom.videoEffectType) {
          this.dom.videoEffectType.value =
            options.effectType || (context === 'look' ? 'look' : context);
        }
        this.updateEffectTrackHighlight();
        this.updateTimelineHint();
      }
    }
  }

  updateAdjustmentsContext(options: AdjustmentOptions = {}) {
    if (this.host.sourceMode !== 'video') return;
    if (!this.getSelectedVideoEffectItem()) {
      this.updateAdjustmentsPanelState();
      return;
    }
    this.setAdjustmentsContext(this.resolveAdjustmentsContext(), options);
  }

  openAdjustmentsForContext(
    context: string | undefined,
    options: AdjustmentOptions = {},
  ) {
    if (this.host.sourceMode !== 'video') return;
    this.setAdjustmentsContext(context, options);
    this.setInspectorTab('adjust');
  }

  updateEffectTrackHighlight(activeType: string | null = null) {
    if (!this.dom.videoTimelineEl) return;
    const selected = this.editor.timeline.items.find(
      (item) => item.id === this.selectedVideoEffectId,
    );
    const type =
      activeType || this.paletteDragState?.type || selected?.type || null;
    this.dom.videoTimelineEl
      .querySelectorAll<HTMLElement>('.timeline-track-effects')
      .forEach((track) => {
        track.classList.toggle(
          'is-target-track',
          !!type && track.dataset.track === type,
        );
      });
  }

  setInspectorTab(tabName: InspectorTab) {
    this.inspectorTab = tabName;
    updateEditorUiState({ inspectorTab: tabName });
    if (tabName === 'adjust' && this.host.sourceMode === 'video') {
      this.updateAdjustmentsPanelState();
    }
  }

  setEditorTool(tool: EditorTool) {
    this.editorTool = tool;
    document.body.dataset.editorTool = tool;
    if (this.dom.videoTimelineEl)
      this.dom.videoTimelineEl.dataset.editorTool = tool;
    [this.dom.btnToolSelect, this.dom.btnToolTrim].forEach((button) => {
      if (!button) return;
      button.classList.toggle('is-active', button.dataset.tool === tool);
    });
    this.updateTimelineHint();
    this.updateEffectTrackHighlight();
    if (tool !== 'cut') this.hideTimelineCutGuide();
    if (this.host.sourceMode === 'video' && this.inspectorTab === 'adjust') {
      this.updateAdjustmentsPanelState();
    }
  }

  updateTimelineHint() {
    if (!this.dom.timelineHintText) return;
    if (!this.editor.source?.file) {
      this.dom.timelineHintText.textContent = '';
      return;
    }
    const hints = {
      select:
        'Arrastrá para seleccionar varios, mové clips o presioná M para marcar.',
      cut: 'La línea roja marca el corte. Click sobre un clip de efecto.',
      trim: 'Arrastrá los bordes rojos en VIDEO.',
    };
    this.dom.timelineHintText.textContent = translateCurrent(
      hints[this.editorTool] || hints.select,
    );
  }

  pushTimelineHistory() {
    if (
      !this.editor.history ||
      this.timelineHistorySuspended ||
      !this.editor.source?.file
    )
      return;
    this.editor.history.push(this.editor.timeline);
    this.updateEditorHistoryButtons();
  }

  pushTimelineHistorySnapshot(snapshot: TimelineSnapshot | null) {
    if (
      !snapshot ||
      !this.editor.history ||
      this.timelineHistorySuspended ||
      !this.editor.source?.file
    )
      return;
    this.editor.history.pushSnapshot(snapshot);
    this.updateEditorHistoryButtons();
  }

  undoTimelineEdit() {
    if (!this.editor.history?.undo(this.editor.timeline)) return;
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.applyVideoTrim(false);
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    void this.editor?.timelineEffects.sync(true);
  }

  redoTimelineEdit() {
    if (!this.editor.history?.redo(this.editor.timeline)) return;
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.applyVideoTrim(false);
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    void this.editor?.timelineEffects.sync(true);
  }

  updateEditorHistoryButtons() {
    updateEditorUiState({
      canUndo:
        !!this.editor.history?.canUndo && !this.editor.exportSession?.active,
      canRedo:
        !!this.editor.history?.canRedo && !this.editor.exportSession?.active,
      exporting: !!this.editor.exportSession?.active,
    });
  }

  applyTimelineZoom() {
    if (!this.dom.timelineScroll || !this.dom.timelineTrackArea) return;
    const baseWidth = this.dom.timelineViewport
      ? this.dom.timelineViewport.clientWidth - 72
      : 800;
    const width = Math.max(baseWidth, baseWidth * this.timelineZoom);
    this.dom.timelineScroll.style.width = `${width + 72}px`;
    if (this.dom.timelineZoomInput)
      this.dom.timelineZoomInput.value = String(this.timelineZoom);
    this.renderVideoTimeline();
    this.renderTimelineRuler();
  }

  getTimelineTrackAreaBounds() {
    if (!this.dom.timelineTrackArea)
      return { left: 0, top: 0, width: 1, height: 1 };
    const rect = this.dom.timelineTrackArea.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    };
  }

  renderTimelineRuler() {
    if (!this.dom.timelineTimeRuler || !this.dom.timelineTrackArea) return;
    const duration = Math.max(0.001, this.editor.timeline.duration);
    const width = this.dom.timelineTrackArea.offsetWidth;
    this.editor.timelineView.renderRuler({
      ruler: this.dom.timelineTimeRuler,
      duration,
      width,
    });
  }

  positionTimelineElement(
    el: HTMLElement,
    startTime: number,
    endTime: number | null = null,
  ) {
    const duration = Math.max(0.001, this.editor.timeline.duration);
    const left = (startTime / duration) * 100;
    el.style.left = `${clamp(left, 0, 100)}%`;
    if (endTime != null) {
      el.style.width = `${clamp(((endTime - startTime) / duration) * 100, 0, 100)}%`;
    }
  }

  getTimelineTrackCount() {
    return TIMELINE_TRACK_COUNT;
  }

  getTimelineItemElements() {
    return this.dom.timelineTrackArea
      ? this.dom.timelineTrackArea.querySelectorAll<HTMLElement>(
          '.timeline-item',
        )
      : [];
  }

  clearTimelineItemElements() {
    this.getTimelineItemElements().forEach((el) => el.remove());
    if (this.dom.timelineItems) this.dom.timelineItems.innerHTML = '';
  }

  appendTimelineClip(el: HTMLElement, type: string) {
    const track = this.dom.timelineTrackArea?.querySelector(
      `.timeline-track-effects[data-track="${type}"]`,
    );
    (track || this.dom.timelineItems)?.appendChild(el);
  }

  getTimelineRowStyle(rowIndex: number) {
    const count = this.getTimelineTrackCount();
    return {
      top: `calc(${rowIndex} * 100% / ${count})`,
      height: `calc(100% / ${count})`,
    };
  }

  positionTimelineRowElement(
    el: HTMLElement,
    startTime: number,
    endTime: number | null,
    rowIndex: number,
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
  }

  toggleTimelineMarkerAtPlayhead() {
    if (
      !this.editor.source?.file ||
      typeof this.editor.timeline.toggleMarker !== 'function'
    )
      return;
    const threshold = 0.08 / Math.max(1, this.timelineZoom);
    this.pushTimelineHistory();
    const result = this.editor.timeline.toggleMarker(
      this.dom.videoEl.currentTime || this.editor.timeline.trimStart,
      threshold,
    );
    this.renderVideoTimeline();
    showStatus(
      this.dom.videoEditorStatus,
      translateCurrent(
        result.action === 'added'
          ? 'Marcador agregado.'
          : 'Marcador eliminado.',
      ),
      'success',
    );
    setTimeout(() => hideStatus(this.dom.videoEditorStatus), 900);
    this.updateTimelineHint();
  }

  getTimelineTime(clientX: number) {
    return this.snapTimelineTime(this.getTimelineRawTime(clientX));
  }

  getTimelineRawTime(clientX: number) {
    const bounds = this.getTimelineTrackAreaBounds();
    const ratio = clamp((clientX - bounds.left) / bounds.width, 0, 1);
    return ratio * this.editor.timeline.duration;
  }

  beginTimelineSelection(event: PointerEvent) {
    if (
      !this.editor.source?.file ||
      this.editor.exportSession?.active ||
      event.button !== 0
    )
      return;
    if (
      targetElement(event)?.closest(
        '.timeline-item, .timeline-item-handle, .timeline-trim-handle, .timeline-playhead-handle',
      )
    )
      return;
    event.preventDefault();

    if (this.editorTool === 'trim') {
      this.editor.transport.seek(this.getTimelineTime(event.clientX));
      return;
    }

    if (
      this.editorTool === 'select' &&
      targetElement(event)?.closest('.timeline-track-effects') &&
      !targetElement(event)?.closest('.timeline-item')
    ) {
      this.beginTimelineBoxSelection(event);
      return;
    }

    this.editor.transport.seek(this.getTimelineTime(event.clientX));
  }

  beginTimelineBoxSelection(event: PointerEvent) {
    const bounds = this.getTimelineTrackAreaBounds();
    const originX = clamp(event.clientX - bounds.left, 0, bounds.width);
    const originY = clamp(event.clientY - bounds.top, 0, bounds.height);
    let dragged = false;

    const draw = (moveEvent: PointerEvent) => {
      const x = clamp(moveEvent.clientX - bounds.left, 0, bounds.width);
      const y = clamp(moveEvent.clientY - bounds.top, 0, bounds.height);
      if (Math.abs(x - originX) > 4 || Math.abs(y - originY) > 4)
        dragged = true;
      if (!dragged || !this.dom.timelineSelection) return;
      this.dom.timelineSelection.classList.add('is-active');
      this.dom.timelineSelection.style.left = `${Math.min(originX, x)}px`;
      this.dom.timelineSelection.style.top = `${Math.min(originY, y)}px`;
      this.dom.timelineSelection.style.width = `${Math.abs(x - originX)}px`;
      this.dom.timelineSelection.style.height = `${Math.abs(y - originY)}px`;
    };

    const end = (upEvent: PointerEvent) => {
      this.dom.timelineSelection?.classList.remove('is-active');
      if (!dragged) {
        this.editor.transport.seek(this.getTimelineTime(event.clientX));
        this.selectVideoEffect('');
        return;
      }
      const endX = clamp(upEvent.clientX - bounds.left, 0, bounds.width);
      const endY = clamp(upEvent.clientY - bounds.top, 0, bounds.height);
      this.selectVideoEffectsInRect(
        Math.min(originX, endX),
        Math.max(originX, endX),
        Math.min(originY, endY),
        Math.max(originY, endY),
        bounds,
      );
    };

    this.bindDrag(draw, end);
  }

  selectVideoEffectsInRect(
    left: number,
    right: number,
    top: number,
    bottom: number,
    bounds: TimelineBounds,
  ) {
    const start = (left / bounds.width) * this.editor.timeline.duration;
    const end = (right / bounds.width) * this.editor.timeline.duration;
    // Rows are counted like the rest of the timeline: row 0 is VIDEO and the
    // effect rows start at 1, so every track is height / trackCount tall.
    const rowHeight = bounds.height / this.getTimelineTrackCount();
    const ids = this.editor.timeline.items
      .filter((item) => {
        const row = effectMeta(item.type)?.row || 1;
        const rowTop = row * rowHeight;
        const rowBottom = rowTop + rowHeight;
        return (
          item.startTime <= end &&
          item.endTime >= start &&
          rowBottom >= top &&
          rowTop <= bottom
        );
      })
      .map((item) => item.id);
    this.selectedVideoEffectIds = new Set(ids);
    this.selectedVideoEffectId = ids[0] || '';
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    this.updateEffectTrackHighlight();
    if (ids.length) this.setInspectorTab('effect');
  }

  beginTrimDrag(event: PointerEvent, edge: 'start' | 'end') {
    if (
      !this.editor.source?.file ||
      this.editor.exportSession?.active ||
      this.editorTool !== 'trim'
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    // Snapshot now and commit it only if the trim actually moved, so clicking
    // a handle does not add an empty undo step.
    const snapshot =
      this.editor.history?.snapshot?.(this.editor.timeline) || null;
    const itemStarts = this.editor.timeline.items.map((item) => item.startTime);
    const itemEnds = this.editor.timeline.items.map((item) => item.endTime);
    const minEnd = itemEnds.length ? Math.max(...itemEnds) : 0.05;
    const maxStart = itemStarts.length
      ? Math.min(...itemStarts)
      : this.editor.timeline.duration - 0.05;

    const move = (moveEvent: PointerEvent) => {
      const time = this.getTimelineTime(moveEvent.clientX);
      if (edge === 'start') {
        this.dom.videoTrimStart.value = clamp(
          time,
          0,
          Math.min(maxStart, this.editor.timeline.trimEnd - 0.05),
        ).toFixed(2);
      } else {
        this.dom.videoTrimEnd.value = clamp(
          time,
          Math.max(minEnd, this.editor.timeline.trimStart + 0.05),
          this.editor.timeline.duration,
        ).toFixed(2);
      }
      this.applyVideoTrim(false);
    };
    const end = () => {
      if (
        snapshot &&
        (snapshot.trimStart !== this.editor.timeline.trimStart ||
          snapshot.trimEnd !== this.editor.timeline.trimEnd)
      ) {
        this.pushTimelineHistorySnapshot(snapshot);
      }
    };
    this.bindDrag(move, end);
  }

  beginTimelineDrag(
    event: PointerEvent,
    item: TimelineItem,
    element: HTMLElement,
  ) {
    if (
      !this.editor.source?.file ||
      this.editor.exportSession?.active ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (this.editorTool === 'cut') {
      this.splitTimelineEffectClipAtEvent(event, item);
      return;
    }
    if (this.editorTool !== 'select') this.setEditorTool('select');
    if (event.shiftKey) {
      this.toggleVideoEffectSelection(item.id);
      return;
    }
    if (!this.selectedVideoEffectIds?.has(item.id)) {
      this.selectedVideoEffectIds = new Set([item.id]);
    }
    this.selectedVideoEffectId = item.id;
    this.dom.videoEffectType.value = item.type;
    this.dom.videoEffectStart.value = item.startTime.toFixed(2);
    this.dom.videoEffectEnd.value = item.endTime.toFixed(2);
    this.getTimelineItemElements().forEach((candidate) => {
      candidate.classList.toggle(
        'is-selected',
        this.selectedVideoEffectIds.has(candidate.dataset.id ?? ''),
      );
    });
    this.updateVideoEffectInspector();
    this.setInspectorTab('effect');
    const bounds = this.getTimelineTrackAreaBounds();
    const originX = event.clientX;
    const original = { ...item };
    const snapshot =
      this.editor.history?.snapshot?.(this.editor.timeline) || null;
    const handleStart = targetElement(event)?.closest(
      '.timeline-item-handle.start',
    );
    const handleEnd = targetElement(event)?.closest(
      '.timeline-item-handle.end',
    );
    let edge: ClipPlacement['edge'] = 'move';
    if (handleStart) edge = 'start';
    else if (handleEnd) edge = 'end';
    element.classList.add('is-dragging');

    const move = (moveEvent: PointerEvent) => {
      const delta =
        ((moveEvent.clientX - originX) / bounds.width) *
        this.editor.timeline.duration;
      let startTime = original.startTime;
      let endTime = original.endTime;
      if (edge === 'start') startTime = original.startTime + delta;
      else if (edge === 'end') endTime = original.endTime + delta;
      else {
        const length = original.endTime - original.startTime;
        startTime = original.startTime + delta;
        endTime = startTime + length;
      }
      ({ startTime, endTime } = this.resolveTimelineClipTimes({
        type: item.type,
        startTime,
        endTime,
        edge,
        itemId: item.id,
      }));
      this.dom.videoEffectStart.value = startTime.toFixed(2);
      this.dom.videoEffectEnd.value = endTime.toFixed(2);
      this.positionTimelineRowElement(
        element,
        startTime,
        endTime,
        effectMeta(item.type)?.row || 1,
      );
      if (this.dom.videoEffectRangeLabel) {
        this.dom.videoEffectRangeLabel.textContent = `${formatDurationDetailed(startTime)} - ${formatDurationDetailed(endTime)}`;
      }
      if (this.dom.videoEffectDurationLabel) {
        this.dom.videoEffectDurationLabel.textContent = `${translateCurrent('Duración')}: ${Math.max(0, endTime - startTime).toFixed(2)} s`;
      }
    };
    const end = () => {
      element.classList.remove('is-dragging');
      try {
        const startTime = Number(this.dom.videoEffectStart.value);
        const endTime = Number(this.dom.videoEffectEnd.value);
        this.editor.timeline.upsert({
          ...item,
          startTime,
          endTime,
        });
        if (startTime !== original.startTime || endTime !== original.endTime) {
          this.pushTimelineHistorySnapshot(snapshot);
        }
      } catch (err) {
        showStatus(
          this.dom.videoEditorStatus,
          err instanceof Error ? err.message : String(err),
          'error',
        );
      }
      this.selectVideoEffect(item.id);
      void this.editor?.timelineEffects.sync(true);
    };
    this.bindDrag(move, end);
  }

  splitTimelineEffectClipAtEvent(
    event: PointerEvent | MouseEvent,
    item: TimelineItem,
  ) {
    try {
      const time = this.getTimelineTime(event.clientX);
      if (time <= item.startTime + 0.05 || time >= item.endTime - 0.05)
        throw new Error('Elegí un punto dentro del clip.');
      this.pushTimelineHistory();
      const [, right] = this.editor.timeline.split(item.id, time);
      this.selectedVideoEffectIds = new Set([right.id]);
      this.selectedVideoEffectId = right.id;
      this.renderVideoTimeline();
      this.updateVideoEffectInspector();
      this.updateAdjustmentsPanelState();
      this.updateEffectTrackHighlight();
      void this.editor?.timelineEffects.sync(true);
    } catch (err) {
      showStatus(
        this.dom.videoEditorStatus,
        err instanceof Error ? err.message : String(err),
        'error',
      );
    }
  }

  updateTimelineCutGuide(event: PointerEvent) {
    if (
      this.editorTool !== 'cut' ||
      !this.editor.source?.file ||
      this.editor.exportSession?.active ||
      !this.dom.timelineCutGuide
    ) {
      this.hideTimelineCutGuide();
      return;
    }
    const bounds = this.getTimelineTrackAreaBounds();
    const x = clamp(event.clientX - bounds.left, 0, bounds.width);
    this.dom.timelineCutGuide.style.left = `${x}px`;
    this.dom.timelineCutGuide.classList.add('is-active');
  }

  hideTimelineCutGuide() {
    this.dom.timelineCutGuide?.classList.remove('is-active');
  }

  splitAllEffectsAtMarkers() {
    if (!this.editor.source?.file || this.editor.exportSession?.active) return;
    const times = Array.from(
      new Set(
        (this.editor.timeline.markers || [])
          .map((marker) => this.roundTimelineTime(marker.time))
          .filter(
            (time) =>
              time > this.editor.timeline.trimStart &&
              time < this.editor.timeline.trimEnd,
          ),
      ),
    ).sort((a, b) => a - b);
    if (!times.length) {
      showStatus(
        this.dom.videoEditorStatus,
        'No hay marcadores para cortar.',
        'error',
      );
      return;
    }

    const hasCuts = times.some((time) =>
      this.editor.timeline.items.some(
        (item) => time > item.startTime + 0.05 && time < item.endTime - 0.05,
      ),
    );
    if (!hasCuts) {
      showStatus(
        this.dom.videoEditorStatus,
        'Ningún efecto cruza esos marcadores.',
        'error',
      );
      return;
    }

    let cuts = 0;
    try {
      this.pushTimelineHistory();
      times.forEach((time) => {
        [...this.editor.timeline.items].forEach((item) => {
          const current = this.editor.timeline.items.find(
            (candidate) => candidate.id === item.id,
          );
          if (
            current &&
            time > current.startTime + 0.05 &&
            time < current.endTime - 0.05
          ) {
            this.editor.timeline.split(current.id, time);
            cuts += 1;
          }
        });
      });
      if (!cuts) throw new Error('Ningún efecto cruza esos marcadores.');
      this.selectedVideoEffectIds = new Set();
      this.selectedVideoEffectId = '';
      this.renderVideoTimeline();
      this.updateVideoEffectInspector();
      this.updateAdjustmentsPanelState();
      this.updateEffectTrackHighlight();
      void this.editor?.timelineEffects.sync(true);
      showStatus(
        this.dom.videoEditorStatus,
        `Cortes creados: ${cuts}.`,
        'success',
      );
      setTimeout(() => hideStatus(this.dom.videoEditorStatus), 1200);
    } catch (err) {
      showStatus(
        this.dom.videoEditorStatus,
        err instanceof Error ? err.message : String(err),
        'error',
      );
    }
  }

  beginPlayheadDrag(event: PointerEvent) {
    if (
      !this.editor.source?.file ||
      this.editor.exportSession?.active ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.editor.transport.seek(this.getTimelineTime(event.clientX));
    const move = (moveEvent: PointerEvent) =>
      this.editor.transport.seek(this.getTimelineTime(moveEvent.clientX));
    this.bindDrag(move);
  }

  handleVideoEditorKeydown(event: KeyboardEvent) {
    if (this.host.sourceMode !== 'video' || this.editor.exportSession?.active)
      return;
    const target = event.target;
    const tag = target instanceof HTMLElement ? target.tagName : '';
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      (target instanceof HTMLElement && target.isContentEditable)
    )
      return;

    const primaryMod = event.ctrlKey || event.metaKey;
    if (primaryMod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redoTimelineEdit();
      else this.undoTimelineEdit();
      return;
    }
    if (primaryMod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectAllVideoEffects();
      return;
    }
    if (primaryMod && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.copySelectedVideoEffects(false);
      return;
    }
    if (primaryMod && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      this.copySelectedVideoEffects(true);
      return;
    }
    if (primaryMod && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      this.pasteVideoEffects(event.shiftKey);
      return;
    }
    if (primaryMod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redoTimelineEdit();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      void this.editor.transport.toggle();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.editor.transport.jump(event.shiftKey ? -5 : -0.04);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.editor.transport.jump(event.shiftKey ? 5 : 0.04);
      return;
    }
    if (event.key.toLowerCase() === 'i') {
      event.preventDefault();
      this.dom.videoTrimStart.value = String(this.dom.videoEl.currentTime || 0);
      this.pushTimelineHistory();
      this.applyVideoTrim();
      this.setEditorTool('trim');
      return;
    }
    if (event.key.toLowerCase() === 'o') {
      event.preventDefault();
      this.dom.videoTrimEnd.value = String(this.dom.videoEl.currentTime || 0);
      this.pushTimelineHistory();
      this.applyVideoTrim();
      this.setEditorTool('trim');
      return;
    }
    if (event.key.toLowerCase() === 'm') {
      event.preventDefault();
      this.toggleTimelineMarkerAtPlayhead();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedVideoEffectId) {
        event.preventDefault();
        this.deleteSelectedVideoEffect();
      }
      return;
    }
    if (event.key.toLowerCase() === 'v') {
      this.setEditorTool('select');
      return;
    }
    if (event.key.toLowerCase() === 't') {
      this.setEditorTool('cut');
    }
  }
  cancelInteraction(): void {
    this.dragListeners?.abort();
    this.dragListeners = null;
    this.paletteDragState?.chip.classList.remove('is-dragging');
    this.paletteDragState = null;
    this.removeTimelineDragGhost();
    this.clearTimelineDropTargets();
    this.dom.timelineSelection?.classList.add('hidden');
    this.dom.timelineTrackArea
      ?.querySelectorAll('.is-dragging')
      .forEach((element) => element.classList.remove('is-dragging'));
  }

  private bindDrag(
    move: (event: PointerEvent) => void,
    end?: (event: PointerEvent) => void,
  ): void {
    this.dragListeners?.abort();
    const controller = new AbortController();
    this.dragListeners = controller;
    const { signal } = controller;
    document.addEventListener('pointermove', move, { signal });
    document.addEventListener(
      'pointerup',
      (event) => {
        controller.abort();
        this.dragListeners = null;
        end?.(event);
      },
      { signal },
    );
    document.addEventListener('pointercancel', () => this.cancelInteraction(), {
      signal,
    });
  }

  enterVideo(): void {
    this.mountVideoEffectsControls();
    this.setEditorTool('select');
    this.setInspectorTab('project');
    this.applyTimelineZoom();
    this.host.preferences.publishWebcamPanel();
  }

  leaveVideo(): void {
    this.cancelInteraction();
    this.unmountVideoEffectsControls();
    this.host.preferences.publishWebcamPanel();
  }

  resetSelection(): void {
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds.clear();
    this.timelineClipboard = null;
    this.updateTimelineClipboardStatus();
  }

  resetTimeline(): void {
    this.cancelInteraction();
    this.updateEditorHistoryButtons();
    this.timelineZoom = 1;
    this.resetSelection();
    this.clearTimelineItemElements();
  }

  prepareSource(duration: number): void {
    const { videoTrimStart, videoTrimEnd, videoEffectStart, videoEffectEnd } =
      this.dom;
    for (const input of [
      videoTrimStart,
      videoTrimEnd,
      videoEffectStart,
      videoEffectEnd,
    ])
      input.max = String(duration);
    videoTrimStart.value = '0';
    videoTrimEnd.value = duration.toFixed(2);
    videoEffectStart.value = '0';
    videoEffectEnd.value = duration.toFixed(2);
  }

  refreshLocale(): void {
    this._adjustClipStatusKey = '';
    this.updateAdjustmentsContext();
    this.updateAdjustmentsClipStatus();
    this.updateTimelineHint();
  }

  bindEditorSplitters() {
    const { signal } = this.lifetime;
    const root = document.documentElement;
    const savedLayout = this.host.preferences.loadJsonStorage(
      'hatewebcam-editor-layout',
      {} as Record<string, unknown>,
    );
    const applySize = (axis: SplitterAxis, size: unknown) => {
      const horizontal = axis === 'horizontal';
      const min = horizontal ? 240 : 250;
      const max = horizontal
        ? Math.max(min, window.innerHeight - 260)
        : Math.max(min, window.innerWidth - 420);
      const value = Math.round(clamp(Number(size) || min, min, max));
      root.style.setProperty(
        horizontal ? '--editor-timeline-h' : '--editor-inspector-w',
        `${value}px`,
      );
      return value;
    };
    const saveSize = (axis: SplitterAxis, value: number) => {
      savedLayout[axis] = value;
      this.host.preferences.saveJsonStorage(
        'hatewebcam-editor-layout',
        savedLayout,
      );
    };
    const bind = (splitter: HTMLElement | null, axis: SplitterAxis) => {
      if (!splitter) return;
      if (savedLayout[axis]) applySize(axis, savedLayout[axis]);
      splitter.addEventListener(
        'pointerdown',
        (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          splitter.setPointerCapture(event.pointerId);
          document.body.classList.add('is-resizing-editor');
          document.body.dataset.resizeAxis = axis;
        },
        { signal },
      );
      splitter.addEventListener(
        'pointermove',
        (event) => {
          if (!splitter.hasPointerCapture(event.pointerId)) return;
          applySize(
            axis,
            axis === 'horizontal'
              ? window.innerHeight - event.clientY
              : window.innerWidth - event.clientX,
          );
        },
        { signal },
      );
      splitter.addEventListener(
        'pointerup',
        (event) => {
          if (!splitter.hasPointerCapture(event.pointerId)) return;
          splitter.releasePointerCapture(event.pointerId);
          document.body.classList.remove('is-resizing-editor');
          delete document.body.dataset.resizeAxis;
          const property =
            axis === 'horizontal'
              ? '--editor-timeline-h'
              : '--editor-inspector-w';
          saveSize(axis, parseInt(root.style.getPropertyValue(property), 10));
        },
        { signal },
      );
      splitter.addEventListener(
        'keydown',
        (event) => {
          const direction =
            axis === 'horizontal'
              ? event.key === 'ArrowUp'
                ? 1
                : event.key === 'ArrowDown'
                  ? -1
                  : 0
              : event.key === 'ArrowLeft'
                ? 1
                : event.key === 'ArrowRight'
                  ? -1
                  : 0;
          if (!direction) return;
          event.preventDefault();
          const pane =
            axis === 'horizontal'
              ? this.dom.timelineSplitter?.nextElementSibling
              : this.dom.videoInspector;
          const current =
            axis === 'horizontal'
              ? pane?.getBoundingClientRect().height
              : pane?.getBoundingClientRect().width;
          saveSize(axis, applySize(axis, (current ?? 0) + direction * 20));
        },
        { signal },
      );
      splitter.addEventListener(
        'dblclick',
        () => {
          delete savedLayout[axis];
          root.style.removeProperty(
            axis === 'horizontal'
              ? '--editor-timeline-h'
              : '--editor-inspector-w',
          );
          this.host.preferences.saveJsonStorage(
            'hatewebcam-editor-layout',
            savedLayout,
          );
        },
        { signal },
      );
    };
    bind(this.dom.inspectorSplitter, 'vertical');
    bind(this.dom.timelineSplitter, 'horizontal');
  }

  // Editor-only listeners are attached when the lazy editor chunk loads.
  bindVideoEditorEvents() {
    const { signal } = this.lifetime;
    if (this.dom.videoEffectType) {
      this.dom.videoEffectType.addEventListener(
        'change',
        () => {
          this.updateEffectTrackHighlight();
          this.updateTimelineHint();
          if (
            this.host.sourceMode === 'video' &&
            this.inspectorTab === 'adjust'
          ) {
            this.setAdjustmentsContext(this.dom.videoEffectType.value);
          }
        },
        { signal },
      );
    }
    this.dom.videoTrimStart.addEventListener(
      'change',
      () => {
        this.pushTimelineHistory();
        this.applyVideoTrim();
      },
      { signal },
    );
    this.dom.videoTrimEnd.addEventListener(
      'change',
      () => {
        this.pushTimelineHistory();
        this.applyVideoTrim();
      },
      { signal },
    );
    this.dom.btnSetTrimFromPlayhead?.addEventListener(
      'click',
      () => {
        this.dom.videoTrimStart.value = String(
          this.dom.videoEl.currentTime || 0,
        );
        this.pushTimelineHistory();
        this.applyVideoTrim();
      },
      { signal },
    );
    this.dom.btnSetTrimEndFromPlayhead?.addEventListener(
      'click',
      () => {
        this.dom.videoTrimEnd.value = String(this.dom.videoEl.currentTime || 0);
        this.pushTimelineHistory();
        this.applyVideoTrim();
      },
      { signal },
    );
    if (this.dom.btnOpenEffectAdjust) {
      this.dom.btnOpenEffectAdjust.addEventListener(
        'click',
        () => {
          const item = this.editor.timeline.items.find(
            (candidate) => candidate.id === this.selectedVideoEffectId,
          );
          if (item) this.openAdjustmentsForContext(item.type);
        },
        { signal },
      );
    }
    if (this.dom.videoEffectStart) {
      this.dom.videoEffectStart.addEventListener(
        'change',
        () => this.commitSelectedEffectTiming({ pushHistory: true }),
        { signal },
      );
    }
    if (this.dom.videoEffectEnd) {
      this.dom.videoEffectEnd.addEventListener(
        'change',
        () => this.commitSelectedEffectTiming({ pushHistory: true }),
        { signal },
      );
    }
    if (this.dom.videoEffectAutomationSelect) {
      this.dom.videoEffectAutomationSelect.addEventListener(
        'change',
        () => this.commitSelectedEffectAutomation(),
        { signal },
      );
    }
    this.dom.btnDeleteVideoEffect?.addEventListener(
      'click',
      this.deleteSelectedVideoEffect.bind(this),
      { signal },
    );
    if (this.dom.btnToolSelect)
      this.dom.btnToolSelect.addEventListener(
        'click',
        () => this.setEditorTool('select'),
        { signal },
      );
    if (this.dom.btnToolTrim)
      this.dom.btnToolTrim.addEventListener(
        'click',
        () => this.setEditorTool('cut'),
        { signal },
      );
    if (this.dom.btnCutAtMarkers)
      this.dom.btnCutAtMarkers.addEventListener(
        'click',
        this.splitAllEffectsAtMarkers.bind(this),
        { signal },
      );
    if (this.dom.btnTimelineZoomIn)
      this.dom.btnTimelineZoomIn.addEventListener(
        'click',
        () => {
          this.timelineZoom = clamp(this.timelineZoom + 0.5, 1, 8);
          this.applyTimelineZoom();
        },
        { signal },
      );
    if (this.dom.btnTimelineZoomOut)
      this.dom.btnTimelineZoomOut.addEventListener(
        'click',
        () => {
          this.timelineZoom = clamp(this.timelineZoom - 0.5, 1, 8);
          this.applyTimelineZoom();
        },
        { signal },
      );
    if (this.dom.timelineZoomInput)
      this.dom.timelineZoomInput.addEventListener(
        'input',
        () => {
          this.timelineZoom = clamp(
            Number(this.dom.timelineZoomInput?.value) || 1,
            1,
            8,
          );
          this.applyTimelineZoom();
        },
        { signal },
      );
    if (this.dom.timelineViewport) {
      this.dom.timelineViewport.addEventListener(
        'wheel',
        (event) => {
          if (!event.ctrlKey || this.host.sourceMode !== 'video') return;
          event.preventDefault();
          this.timelineZoom = clamp(
            this.timelineZoom + (event.deltaY < 0 ? 0.25 : -0.25),
            1,
            8,
          );
          this.applyTimelineZoom();
        },
        { ...{ passive: false }, signal },
      );
    }
    if (this.dom.btnEditorUndo)
      this.dom.btnEditorUndo.addEventListener(
        'click',
        this.undoTimelineEdit.bind(this),
        { signal },
      );
    if (this.dom.btnEditorRedo)
      this.dom.btnEditorRedo.addEventListener(
        'click',
        this.redoTimelineEdit.bind(this),
        { signal },
      );
    this.dom.inspectorTabs.forEach((tab) => {
      tab.addEventListener(
        'click',
        () =>
          this.setInspectorTab(
            tab.dataset.tab === 'adjust'
              ? 'adjust'
              : tab.dataset.tab === 'effect'
                ? 'effect'
                : 'project',
          ),
        { signal },
      );
    });
    this.dom.adjustContextNav
      ?.querySelectorAll<HTMLElement>('.adjust-context-tab')
      .forEach((tab) => {
        tab.addEventListener(
          'click',
          () => {
            this.openAdjustmentsForContext(tab.dataset.adjustContext);
          },
          { signal },
        );
      });
    this.dom.videoTimelineEl
      ?.querySelectorAll<HTMLElement>(
        '.timeline-track-label[data-adjust-context]',
      )
      .forEach((label) => {
        label.addEventListener(
          'click',
          (event) => {
            const context = label.dataset.adjustContext;
            const options: AdjustmentOptions = {};
            if (label.dataset.syncTool === 'trim') {
              options.syncTool = true;
              options.tool = 'trim';
            } else if (label.dataset.syncTool === 'effect') {
              options.syncTool = true;
              options.tool = 'effect';
              options.syncEffectType = true;
              if (label.dataset.effectType)
                options.effectType = label.dataset.effectType;
            }
            if (label.dataset.effectType && !event.shiftKey) {
              this.selectVideoEffectsByType(label.dataset.effectType);
            }
            this.openAdjustmentsForContext(context, options);
          },
          { signal },
        );
      });
    document.addEventListener(
      'keydown',
      this.handleVideoEditorKeydown.bind(this),
      { signal },
    );
    window.addEventListener(
      'resize',
      () => {
        if (this.host.sourceMode === 'video') this.applyTimelineZoom();
      },
      { signal },
    );
    if (this.dom.timelinePlayheadHandle)
      this.dom.timelinePlayheadHandle.addEventListener(
        'pointerdown',
        this.beginPlayheadDrag.bind(this),
        { signal },
      );
    if (this.dom.timelineTrackArea)
      this.dom.timelineTrackArea?.addEventListener(
        'pointerdown',
        this.beginTimelineSelection.bind(this),
        { signal },
      );
    this.dom.timelineTrackArea?.addEventListener(
      'pointermove',
      this.updateTimelineCutGuide.bind(this),
      { signal },
    );
    this.dom.timelineTrackArea?.addEventListener(
      'pointerleave',
      () => this.hideTimelineCutGuide(),
      { signal },
    );
    this.dom.timelineTrimStartHandle.addEventListener(
      'pointerdown',
      (event) => this.beginTrimDrag(event, 'start'),
      { signal },
    );
    this.dom.timelineTrimEndHandle.addEventListener(
      'pointerdown',
      (event) => this.beginTrimDrag(event, 'end'),
      { signal },
    );
  }
}

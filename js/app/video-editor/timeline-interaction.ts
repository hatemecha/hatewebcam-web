import { TIMELINE_EFFECT_META } from '../constants.ts';
import type { readAppDom } from '../dom.ts';
import { showStatus } from '../feedback.ts';
import { clamp } from '../webcam-settings.ts';
import type { TimelineItem } from '../../editor/video-timeline.ts';
import type { VideoEditorSession } from './session.ts';
import type { EditorWorkspace } from './workspace.ts';

type InteractionWorkspace = Pick<
  EditorWorkspace,
  | 'editorTool'
  | 'getTimelineTime'
  | 'getTimelineTrackAreaBounds'
  | 'selectVideoEffect'
  | 'selectVideoEffectsInRect'
  | 'applyVideoTrim'
  | 'pushTimelineHistorySnapshot'
  | 'splitTimelineEffectClipAtEvent'
  | 'setEditorTool'
  | 'toggleVideoEffectSelection'
  | 'selectedVideoEffectIds'
  | 'selectedVideoEffectId'
  | 'getTimelineItemElements'
  | 'updateVideoEffectInspector'
  | 'setInspectorTab'
  | 'resolveTimelineClipTimes'
  | 'publishClip'
  | 'positionTimelineRowElement'
  | 'cancelInteraction'
>;

function targetElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

export class TimelineInteraction {
  private dragListeners: AbortController | null = null;

  constructor(
    private readonly editor: VideoEditorSession,
    private readonly dom: ReturnType<typeof readAppDom>,
    private readonly workspace: InteractionWorkspace,
  ) {}

  cancel(): boolean {
    if (!this.dragListeners) return false;
    this.dragListeners.abort();
    this.dragListeners = null;
    return true;
  }

  bind(signal: AbortSignal): void {
    if (this.dom.timelinePlayheadHandle)
      this.dom.timelinePlayheadHandle.addEventListener(
        'pointerdown',
        (event) => this.beginPlayheadDrag(event),
        { signal },
      );
    if (this.dom.timelineTrackArea)
      this.dom.timelineTrackArea?.addEventListener(
        'pointerdown',
        (event) => this.beginTimelineSelection(event),
        { signal },
      );
    this.dom.timelineTrackArea?.addEventListener(
      'pointermove',
      (event) => this.updateTimelineCutGuide(event),
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

    if (this.workspace.editorTool === 'trim') {
      this.editor.transport.seek(this.workspace.getTimelineTime(event.clientX));
      return;
    }

    if (
      this.workspace.editorTool === 'select' &&
      targetElement(event)?.closest('.timeline-track-effects') &&
      !targetElement(event)?.closest('.timeline-item')
    ) {
      this.beginTimelineBoxSelection(event);
      return;
    }

    this.editor.transport.seek(this.workspace.getTimelineTime(event.clientX));
  }

  beginTimelineBoxSelection(event: PointerEvent) {
    const bounds = this.workspace.getTimelineTrackAreaBounds();
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
        this.editor.transport.seek(
          this.workspace.getTimelineTime(event.clientX),
        );
        this.workspace.selectVideoEffect('');
        return;
      }
      const endX = clamp(upEvent.clientX - bounds.left, 0, bounds.width);
      const endY = clamp(upEvent.clientY - bounds.top, 0, bounds.height);
      this.workspace.selectVideoEffectsInRect(
        Math.min(originX, endX),
        Math.max(originX, endX),
        Math.min(originY, endY),
        Math.max(originY, endY),
        bounds,
      );
    };

    this.bindDrag(draw, end);
  }

  beginTrimDrag(event: PointerEvent, edge: 'start' | 'end') {
    if (
      !this.editor.source?.file ||
      this.editor.exportSession?.active ||
      this.workspace.editorTool !== 'trim'
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
      const time = this.workspace.getTimelineTime(moveEvent.clientX);
      const { trimStart, trimEnd, duration } = this.editor.timeline;
      if (edge === 'start') {
        this.workspace.applyVideoTrim(
          Number(clamp(time, 0, Math.min(maxStart, trimEnd - 0.05)).toFixed(2)),
          trimEnd,
        );
      } else {
        this.workspace.applyVideoTrim(
          trimStart,
          Number(
            clamp(time, Math.max(minEnd, trimStart + 0.05), duration).toFixed(
              2,
            ),
          ),
        );
      }
    };
    const end = () => {
      if (
        snapshot &&
        (snapshot.trimStart !== this.editor.timeline.trimStart ||
          snapshot.trimEnd !== this.editor.timeline.trimEnd)
      ) {
        this.workspace.pushTimelineHistorySnapshot(snapshot);
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
    if (this.workspace.editorTool === 'cut') {
      this.workspace.splitTimelineEffectClipAtEvent(event, item);
      return;
    }
    if (this.workspace.editorTool !== 'select')
      this.workspace.setEditorTool('select');
    if (event.shiftKey) {
      this.workspace.toggleVideoEffectSelection(item.id);
      return;
    }
    if (!this.workspace.selectedVideoEffectIds?.has(item.id)) {
      this.workspace.selectedVideoEffectIds = new Set([item.id]);
    }
    this.workspace.selectedVideoEffectId = item.id;

    this.workspace.getTimelineItemElements().forEach((candidate) => {
      candidate.classList.toggle(
        'is-selected',
        this.workspace.selectedVideoEffectIds.has(candidate.dataset.id ?? ''),
      );
    });
    this.workspace.updateVideoEffectInspector();
    this.workspace.setInspectorTab('effect');
    const bounds = this.workspace.getTimelineTrackAreaBounds();
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
    let edge: 'move' | 'start' | 'end' = 'move';
    if (handleStart) edge = 'start';
    else if (handleEnd) edge = 'end';
    element.classList.add('is-dragging');
    let previewStart = item.startTime;
    let previewEnd = item.endTime;

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
      ({ startTime, endTime } = this.workspace.resolveTimelineClipTimes({
        type: item.type,
        startTime,
        endTime,
        edge,
        itemId: item.id,
      }));
      previewStart = startTime;
      previewEnd = endTime;
      this.workspace.publishClip(item, previewStart, previewEnd);
      this.workspace.positionTimelineRowElement(
        element,
        startTime,
        endTime,
        TIMELINE_EFFECT_META[item.type as keyof typeof TIMELINE_EFFECT_META]
          ?.row || 1,
      );
    };
    const end = () => {
      element.classList.remove('is-dragging');
      try {
        const startTime = Number(previewStart.toFixed(2));
        const endTime = Number(previewEnd.toFixed(2));
        this.editor.timeline.upsert({
          ...item,
          startTime,
          endTime,
        });
        if (startTime !== original.startTime || endTime !== original.endTime) {
          this.workspace.pushTimelineHistorySnapshot(snapshot);
        }
      } catch (err) {
        showStatus(
          this.dom.videoEditorStatus,
          err instanceof Error ? err.message : String(err),
          'error',
        );
      }
      this.workspace.selectVideoEffect(item.id);
      void this.editor?.timelineEffects.sync(true);
    };
    this.bindDrag(move, end);
  }

  updateTimelineCutGuide(event: PointerEvent) {
    if (
      this.workspace.editorTool !== 'cut' ||
      !this.editor.source?.file ||
      this.editor.exportSession?.active ||
      !this.dom.timelineCutGuide
    ) {
      this.hideTimelineCutGuide();
      return;
    }
    const bounds = this.workspace.getTimelineTrackAreaBounds();
    const x = clamp(event.clientX - bounds.left, 0, bounds.width);
    this.dom.timelineCutGuide.style.left = `${x}px`;
    this.dom.timelineCutGuide.classList.add('is-active');
  }

  hideTimelineCutGuide() {
    this.dom.timelineCutGuide?.classList.remove('is-active');
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
    this.editor.transport.seek(this.workspace.getTimelineTime(event.clientX));
    const move = (moveEvent: PointerEvent) =>
      this.editor.transport.seek(
        this.workspace.getTimelineTime(moveEvent.clientX),
      );
    this.bindDrag(move);
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
    document.addEventListener(
      'pointercancel',
      () => this.workspace.cancelInteraction(),
      {
        signal,
      },
    );
  }
}

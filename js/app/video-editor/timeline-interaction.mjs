/** @param {import('../controller.mjs').AppController} proto */
export function applyVideoEditorTimelineInteractionMixin(proto) {
  proto.beginTimelineSelection = function (event) {
    if (!this.videoSourceFile || this.isVideoExporting || event.button !== 0)
      return;
    if (
      event.target.closest(
        '.timeline-item, .timeline-item-handle, .timeline-trim-handle, .timeline-playhead-handle',
      )
    )
      return;
    event.preventDefault();

    if (this.editorTool === 'trim') {
      this.seekVideo(this.getTimelineTime(event.clientX));
      return;
    }

    if (
      this.editorTool === 'select' &&
      event.target.closest('.timeline-track-effects') &&
      !event.target.closest('.timeline-item')
    ) {
      this.beginTimelineBoxSelection(event);
      return;
    }

    this.seekVideo(this.getTimelineTime(event.clientX));
  };

  proto.beginTimelineBoxSelection = function (event) {
    const bounds = this.getTimelineTrackAreaBounds();
    const originX = this.clamp(event.clientX - bounds.left, 0, bounds.width);
    const originY = this.clamp(event.clientY - bounds.top, 0, bounds.height);
    let dragged = false;

    const draw = (moveEvent) => {
      const x = this.clamp(moveEvent.clientX - bounds.left, 0, bounds.width);
      const y = this.clamp(moveEvent.clientY - bounds.top, 0, bounds.height);
      if (Math.abs(x - originX) > 4 || Math.abs(y - originY) > 4)
        dragged = true;
      if (!dragged || !this.timelineSelection) return;
      this.timelineSelection.classList.add('is-active');
      this.timelineSelection.style.left = `${Math.min(originX, x)}px`;
      this.timelineSelection.style.top = `${Math.min(originY, y)}px`;
      this.timelineSelection.style.width = `${Math.abs(x - originX)}px`;
      this.timelineSelection.style.height = `${Math.abs(y - originY)}px`;
    };

    const end = (upEvent) => {
      document.removeEventListener('pointermove', draw);
      document.removeEventListener('pointerup', end);
      this.timelineSelection?.classList.remove('is-active');
      if (!dragged) {
        this.seekVideo(this.getTimelineTime(event.clientX));
        this.selectVideoEffect('');
        return;
      }
      const endX = this.clamp(upEvent.clientX - bounds.left, 0, bounds.width);
      const endY = this.clamp(upEvent.clientY - bounds.top, 0, bounds.height);
      this.selectVideoEffectsInRect(
        Math.min(originX, endX),
        Math.max(originX, endX),
        Math.min(originY, endY),
        Math.max(originY, endY),
        bounds,
      );
    };

    document.addEventListener('pointermove', draw);
    document.addEventListener('pointerup', end, { once: true });
  };

  proto.selectVideoEffectsInRect = function (left, right, top, bottom, bounds) {
    const start = (left / bounds.width) * this.videoTimeline.duration;
    const end = (right / bounds.width) * this.videoTimeline.duration;
    // Rows are counted like the rest of the timeline: row 0 is VIDEO and the
    // effect rows start at 1, so every track is height / trackCount tall.
    const rowHeight = bounds.height / this.getTimelineTrackCount();
    const ids = this.videoTimeline.items
      .filter((item) => {
        const row = this.TIMELINE_EFFECT_META[item.type]?.row || 1;
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
  };

  proto.beginTrimDrag = function (event, edge) {
    if (
      !this.videoSourceFile ||
      this.isVideoExporting ||
      this.editorTool !== 'trim'
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    // Snapshot now and commit it only if the trim actually moved, so clicking
    // a handle does not add an empty undo step.
    const snapshot = this.editorHistory?.snapshot?.(this.videoTimeline) || null;
    const itemStarts = this.videoTimeline.items.map((item) => item.startTime);
    const itemEnds = this.videoTimeline.items.map((item) => item.endTime);
    const minEnd = itemEnds.length ? Math.max(...itemEnds) : 0.05;
    const maxStart = itemStarts.length
      ? Math.min(...itemStarts)
      : this.videoTimeline.duration - 0.05;

    const move = (moveEvent) => {
      const time = this.getTimelineTime(moveEvent.clientX);
      if (edge === 'start') {
        this.videoTrimStart.value = this.clamp(
          time,
          0,
          Math.min(maxStart, this.videoTimeline.trimEnd - 0.05),
        ).toFixed(2);
      } else {
        this.videoTrimEnd.value = this.clamp(
          time,
          Math.max(minEnd, this.videoTimeline.trimStart + 0.05),
          this.videoTimeline.duration,
        ).toFixed(2);
      }
      this.applyVideoTrim(false);
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      if (
        snapshot &&
        (snapshot.trimStart !== this.videoTimeline.trimStart ||
          snapshot.trimEnd !== this.videoTimeline.trimEnd)
      ) {
        this.pushTimelineHistorySnapshot(snapshot);
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  };

  proto.beginTimelineDrag = function (event, item, element) {
    if (!this.videoSourceFile || this.isVideoExporting || event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    if (this.editorTool === 'cut') {
      this.splitTimelineEffectClipAtEvent(event, item);
      return;
    }
    if (this.editorTool !== 'select')
      this.setEditorTool('select', { skipTab: true });
    if (event.shiftKey) {
      this.toggleVideoEffectSelection(item.id);
      return;
    }
    if (!this.selectedVideoEffectIds?.has(item.id)) {
      this.selectedVideoEffectIds = new Set([item.id]);
    }
    this.selectedVideoEffectId = item.id;
    this.videoEffectType.value = item.type;
    this.videoEffectStart.value = item.startTime.toFixed(2);
    this.videoEffectEnd.value = item.endTime.toFixed(2);
    this.getTimelineItemElements().forEach((candidate) => {
      candidate.classList.toggle(
        'is-selected',
        this.selectedVideoEffectIds?.has(candidate.dataset.id),
      );
    });
    this.updateVideoEffectInspector();
    this.setInspectorTab('effect');
    const bounds = this.getTimelineTrackAreaBounds();
    const originX = event.clientX;
    const original = { ...item };
    const snapshot = this.editorHistory?.snapshot?.(this.videoTimeline) || null;
    const handleStart = event.target.closest('.timeline-item-handle.start');
    const handleEnd = event.target.closest('.timeline-item-handle.end');
    let edge = 'move';
    if (handleStart) edge = 'start';
    else if (handleEnd) edge = 'end';
    element.classList.add('is-dragging');

    const move = (moveEvent) => {
      const delta =
        ((moveEvent.clientX - originX) / bounds.width) *
        this.videoTimeline.duration;
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
      this.videoEffectStart.value = startTime.toFixed(2);
      this.videoEffectEnd.value = endTime.toFixed(2);
      this.positionTimelineRowElement(
        element,
        startTime,
        endTime,
        this.TIMELINE_EFFECT_META[item.type]?.row || 1,
      );
      if (this.videoEffectRangeLabel) {
        this.videoEffectRangeLabel.textContent = `${this.formatDurationDetailed(startTime)} - ${this.formatDurationDetailed(endTime)}`;
      }
      if (this.videoEffectDurationLabel) {
        this.videoEffectDurationLabel.textContent = `Duración: ${Math.max(0, endTime - startTime).toFixed(2)} s`;
      }
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      element.classList.remove('is-dragging');
      try {
        const startTime = Number(this.videoEffectStart.value);
        const endTime = Number(this.videoEffectEnd.value);
        this.videoTimeline.upsert({
          ...item,
          startTime,
          endTime,
        });
        if (startTime !== original.startTime || endTime !== original.endTime) {
          this.pushTimelineHistorySnapshot(snapshot);
        }
      } catch (err) {
        this.showStatus(this.videoEditorStatus, err.message, 'error');
      }
      this.selectVideoEffect(item.id);
      void this.syncVideoTimelineEffects(true);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  };

  proto.splitTimelineEffectClipAtEvent = function (event, item) {
    try {
      const time = this.getTimelineTime(event.clientX);
      if (time <= item.startTime + 0.05 || time >= item.endTime - 0.05)
        throw new Error('Elegí un punto dentro del clip.');
      this.pushTimelineHistory();
      const [, right] = this.videoTimeline.split(item.id, time);
      this.selectedVideoEffectIds = new Set([right.id]);
      this.selectedVideoEffectId = right.id;
      this.renderVideoTimeline();
      this.updateVideoEffectInspector();
      this.updateAdjustmentsPanelState();
      this.updateEffectTrackHighlight();
      void this.syncVideoTimelineEffects(true);
    } catch (err) {
      this.showStatus(this.videoEditorStatus, err.message, 'error');
    }
  };

  proto.updateTimelineCutGuide = function (event) {
    if (
      this.editorTool !== 'cut' ||
      !this.videoSourceFile ||
      this.isVideoExporting ||
      !this.timelineCutGuide
    ) {
      this.hideTimelineCutGuide();
      return;
    }
    const bounds = this.getTimelineTrackAreaBounds();
    const x = this.clamp(event.clientX - bounds.left, 0, bounds.width);
    this.timelineCutGuide.style.left = `${x}px`;
    this.timelineCutGuide.classList.add('is-active');
  };

  proto.hideTimelineCutGuide = function () {
    this.timelineCutGuide?.classList.remove('is-active');
  };

  proto.splitAllEffectsAtMarkers = function () {
    if (!this.videoSourceFile || this.isVideoExporting) return;
    const times = Array.from(
      new Set(
        (this.videoTimeline.markers || [])
          .map((marker) => this.roundTimelineTime(marker.time))
          .filter(
            (time) =>
              time > this.videoTimeline.trimStart &&
              time < this.videoTimeline.trimEnd,
          ),
      ),
    ).sort((a, b) => a - b);
    if (!times.length) {
      this.showStatus(
        this.videoEditorStatus,
        'No hay marcadores para cortar.',
        'error',
      );
      return;
    }

    const hasCuts = times.some((time) =>
      this.videoTimeline.items.some(
        (item) => time > item.startTime + 0.05 && time < item.endTime - 0.05,
      ),
    );
    if (!hasCuts) {
      this.showStatus(
        this.videoEditorStatus,
        'Ningún efecto cruza esos marcadores.',
        'error',
      );
      return;
    }

    let cuts = 0;
    try {
      this.pushTimelineHistory();
      times.forEach((time) => {
        [...this.videoTimeline.items].forEach((item) => {
          const current = this.videoTimeline.items.find(
            (candidate) => candidate.id === item.id,
          );
          if (
            current &&
            time > current.startTime + 0.05 &&
            time < current.endTime - 0.05
          ) {
            this.videoTimeline.split(current.id, time);
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
      void this.syncVideoTimelineEffects(true);
      this.showStatus(
        this.videoEditorStatus,
        `Cortes creados: ${cuts}.`,
        'success',
      );
      setTimeout(() => this.hideStatus(this.videoEditorStatus), 1200);
    } catch (err) {
      this.showStatus(this.videoEditorStatus, err.message, 'error');
    }
  };

  proto.beginPlayheadDrag = function (event) {
    if (!this.videoSourceFile || this.isVideoExporting || event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    this.seekVideo(this.getTimelineTime(event.clientX));
    const move = (moveEvent) =>
      this.seekVideo(this.getTimelineTime(moveEvent.clientX));
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  };

  proto.handleVideoEditorKeydown = function (event) {
    if (this.sourceMode !== 'video' || this.isVideoExporting) return;
    const tag = event.target.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      event.target.isContentEditable
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
      void this.toggleVideoPlayback();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.jumpVideo(event.shiftKey ? -5 : -0.04);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.jumpVideo(event.shiftKey ? 5 : 0.04);
      return;
    }
    if (event.key.toLowerCase() === 'i') {
      event.preventDefault();
      this.videoTrimStart.value = String(this.videoEl.currentTime || 0);
      this.pushTimelineHistory();
      this.applyVideoTrim();
      this.setEditorTool('trim');
      return;
    }
    if (event.key.toLowerCase() === 'o') {
      event.preventDefault();
      this.videoTrimEnd.value = String(this.videoEl.currentTime || 0);
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
  };
}

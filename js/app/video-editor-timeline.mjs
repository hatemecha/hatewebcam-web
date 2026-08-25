/** @param {import('./controller.mjs').AppController} proto */
export function applyVideoEditorTimelineMixin(proto) {
  proto.resolveTimelineClipTimes = function ({
    type,
    startTime,
    endTime,
    edge = 'move',
    itemId = '',
  }) {
    const minSpan = 0.05;
    let start = this.roundTimelineTime(startTime);
    let end = this.roundTimelineTime(endTime);
    const span = Math.max(minSpan, end - start);

    if (edge === 'move') {
      start = this.clamp(
        start,
        this.videoTimeline.trimStart,
        this.videoTimeline.trimEnd - span,
      );
      end = start + span;
    } else if (edge === 'start') {
      start = this.clamp(start, this.videoTimeline.trimStart, end - minSpan);
    } else {
      end = this.clamp(end, start + minSpan, this.videoTimeline.trimEnd);
    }

    if (this.chkTimelineSnap?.checked) {
      const threshold = 0.12 / Math.max(1, this.timelineZoom);
      const points = [
        this.videoTimeline.trimStart,
        this.videoTimeline.trimEnd,
        this.videoEl.currentTime || 0,
      ];
      this.videoTimeline.items.forEach((item) => {
        if (item.id === itemId || item.type !== type) return;
        points.push(item.startTime, item.endTime);
      });
      this.videoTimeline.markers?.forEach((marker) => points.push(marker.time));
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
      start = this.clamp(
        start,
        this.videoTimeline.trimStart,
        this.videoTimeline.trimEnd - span,
      );
      end = start + span;
    } else {
      start = this.clamp(
        start,
        this.videoTimeline.trimStart,
        this.videoTimeline.trimEnd - minSpan,
      );
      end = this.clamp(end, start + minSpan, this.videoTimeline.trimEnd);
    }
    return {
      startTime: this.roundTimelineTime(start),
      endTime: this.roundTimelineTime(end),
    };
  };

  proto.getTimelineIntervalPoints = function () {
    const points = [
      this.videoTimeline.trimStart,
      this.videoTimeline.trimEnd,
      ...(this.videoTimeline.markers || []).map((marker) => marker.time),
    ]
      .filter(
        (time) =>
          Number.isFinite(Number(time)) &&
          time >= this.videoTimeline.trimStart &&
          time <= this.videoTimeline.trimEnd,
      )
      .sort((a, b) => a - b);
    return [...new Set(points.map((time) => this.roundTimelineTime(time)))];
  };

  proto.resolveTimelineInsertionTimes = function ({
    type,
    anchorTime,
    duration = this.DEFAULT_TIMELINE_EFFECT_DURATION,
  }) {
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
        this.videoTimeline.trimEnd - this.videoTimeline.trimStart,
      ),
    );
    return this.resolveTimelineClipTimes({
      type,
      startTime: anchorTime,
      endTime: anchorTime + span,
      edge: 'move',
    });
  };

  proto.addTimelineEffectClip = async function (
    type,
    anchorTime,
    duration = this.DEFAULT_TIMELINE_EFFECT_DURATION,
  ) {
    if (!this.videoSourceFile || !this.TIMELINE_EFFECT_META[type]) return null;
    const placed = this.resolveTimelineInsertionTimes({
      type,
      anchorTime,
      duration,
    });
    const { startTime, endTime } = placed;
    if (endTime <= startTime) {
      this.showStatus(
        this.videoEditorStatus,
        'No hay espacio libre en esa pista.',
        'error',
      );
      return null;
    }
    try {
      this.pushTimelineHistory();
      const saved = this.videoTimeline.upsert({
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
          await this.ensureFaceMeshLoaded();
        } catch (err) {
          console.warn('Detector preload failed:', err);
        }
      }
      this.selectVideoEffect(saved.id);
      void this.syncVideoTimelineEffects(true);
      this.showStatus(
        this.videoEditorStatus,
        `${this.TIMELINE_EFFECT_META[type].label} agregado.`,
        'success',
      );
      setTimeout(() => this.hideStatus(this.videoEditorStatus), 1200);
      this.setInspectorTab('adjust');
      return saved;
    } catch (err) {
      this.showStatus(this.videoEditorStatus, err.message, 'error');
      return null;
    }
  };

  proto.selectVideoEffect = function (id) {
    this.syncLookClipConfigNow();
    this.selectedVideoEffectId = id || '';
    this.selectedVideoEffectIds = new Set(id ? [id] : []);
    const item = this.videoTimeline.items.find(
      (candidate) => candidate.id === this.selectedVideoEffectId,
    );
    if (item) {
      this.videoEffectType.value = item.type;
      this.videoEffectStart.value = item.startTime.toFixed(2);
      this.videoEffectEnd.value = item.endTime.toFixed(2);
      this.applyVideoEffectItemConfig(item);
    }
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    this.updateEffectTrackHighlight();
    this.updateTimelineHint();
    if (item) this.setInspectorTab('effect');
  };

  proto.snapTimelineTime = function (time) {
    if (!this.chkTimelineSnap?.checked) return time;
    const points = new Set([
      this.videoTimeline.trimStart,
      this.videoTimeline.trimEnd,
      this.videoEl.currentTime || 0,
    ]);
    if (typeof this.videoTimeline.getSnapPoints === 'function') {
      this.videoTimeline.getSnapPoints().forEach((point) => points.add(point));
    } else {
      this.videoTimeline.items.forEach((item) => {
        points.add(item.startTime);
        points.add(item.endTime);
      });
      this.videoTimeline.markers?.forEach((marker) => points.add(marker.time));
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
  };

  proto.renderVideoTimeline = function () {
    if (!this.timelineItems || !this.videoTimelineEl || !this.timelineTrackArea)
      return;
    const duration = Math.max(0.001, this.videoTimeline.duration);
    const percent = (time) => `${this.clamp((time / duration) * 100, 0, 100)}%`;

    if (this.timelineVideoClip) {
      this.timelineVideoClip.style.left = '0';
      this.timelineVideoClip.style.width = '100%';
    }
    this.timelineTrim.style.left = percent(this.videoTimeline.trimStart);
    this.timelineTrim.style.width = percent(
      this.videoTimeline.trimEnd - this.videoTimeline.trimStart,
    );
    this.timelineTrimStartHandle.style.left = percent(
      this.videoTimeline.trimStart,
    );
    this.timelineTrimEndHandle.style.left = percent(this.videoTimeline.trimEnd);
    if (this.timelineTrimOutsideStart) {
      this.timelineTrimOutsideStart.style.width = percent(
        this.videoTimeline.trimStart,
      );
    }
    if (this.timelineTrimOutsideEnd) {
      this.timelineTrimOutsideEnd.style.left = percent(
        this.videoTimeline.trimEnd,
      );
      this.timelineTrimOutsideEnd.style.width = percent(
        duration - this.videoTimeline.trimEnd,
      );
    }

    const selectionStart = this.selectedVideoEffectId
      ? this.clamp(
          Number(this.videoEffectStart.value) || 0,
          this.videoTimeline.trimStart,
          this.videoTimeline.trimEnd,
        )
      : this.videoEl.currentTime || 0;
    const selectionEnd = this.selectedVideoEffectId
      ? this.clamp(
          Number(this.videoEffectEnd.value) || 0,
          selectionStart,
          this.videoTimeline.trimEnd,
        )
      : selectionStart;
    if (this.selectedVideoEffectId) {
      this.videoEffectStart.value = selectionStart.toFixed(2);
      this.videoEffectEnd.value = selectionEnd.toFixed(2);
    }
    if (this.videoEffectRangeLabel) {
      if (this.selectedVideoEffectId) {
        this.videoEffectRangeLabel.textContent = `${this.formatDurationDetailed(selectionStart)} - ${this.formatDurationDetailed(selectionEnd)}`;
      } else {
        this.videoEffectRangeLabel.textContent = `Cursor: ${this.formatDurationDetailed(this.videoEl.currentTime || 0)}`;
      }
    }
    this.timelinePlayhead.style.left = percent(this.videoEl.currentTime || 0);

    if (this.timelineMarkers) {
      this.timelineMarkers.innerHTML = '';
      (this.videoTimeline.markers || []).forEach((marker) => {
        const markerEl = document.createElement('button');
        markerEl.type = 'button';
        markerEl.className = 'timeline-marker';
        markerEl.dataset.id = marker.id;
        markerEl.dataset.kind = marker.kind || 'manual';
        markerEl.dataset.source = marker.source || 'user';
        markerEl.style.left = percent(marker.time);
        markerEl.title = `${marker.label || 'Marcador'} ${this.formatDurationDetailed(marker.time)}`;
        markerEl.setAttribute('aria-label', markerEl.title);
        markerEl.addEventListener('click', (event) => {
          event.stopPropagation();
          this.seekVideo(marker.time);
        });
        this.timelineMarkers.appendChild(markerEl);
      });
    }

    this.timelineItems.innerHTML = '';
    this.videoTimeline.items.forEach((item) => {
      const meta = this.TIMELINE_EFFECT_META[item.type] || {
        trackLabel: item.type,
        row: 1,
      };
      const el = document.createElement('div');
      const selectedIds = this.selectedVideoEffectIds || new Set();
      el.className = `timeline-item${item.id === this.selectedVideoEffectId || selectedIds.has(item.id) ? ' is-selected' : ''}`;
      el.dataset.id = item.id;
      el.dataset.type = item.type;
      el.innerHTML = `
        <span class="timeline-item-handle start" aria-hidden="true"></span>
        <span class="timeline-item-label">${meta.trackLabel}</span>
        <span class="timeline-item-handle end" aria-hidden="true"></span>
      `;
      this.positionTimelineRowElement(
        el,
        item.startTime,
        item.endTime,
        meta.row,
      );
      el.addEventListener('pointerdown', (event) =>
        this.beginTimelineDrag(event, item, el),
      );
      this.timelineItems.appendChild(el);
    });
    this.renderTimelineRuler();
    this.updateEffectTrackHighlight();
    this.editAssist?.updateUI();
  };
}

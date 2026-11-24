/** @param {import('./controller.mjs').AppController} proto */
export function applyEventsMixin(proto) {
  proto.bindEditorSplitters = function () {
    const root = document.documentElement;
    const savedLayout = this.preferences.loadJsonStorage(
      'hatewebcam-editor-layout',
      {},
    );
    const applySize = (axis, size) => {
      const horizontal = axis === 'horizontal';
      const min = horizontal ? 240 : 250;
      const max = horizontal
        ? Math.max(min, window.innerHeight - 260)
        : Math.max(min, window.innerWidth - 420);
      const value = Math.round(this.clamp(Number(size) || min, min, max));
      root.style.setProperty(
        horizontal ? '--editor-timeline-h' : '--editor-inspector-w',
        `${value}px`,
      );
      return value;
    };
    const saveSize = (axis, value) => {
      savedLayout[axis] = value;
      this.preferences.saveJsonStorage('hatewebcam-editor-layout', savedLayout);
    };
    const bind = (splitter, axis) => {
      if (!splitter) return;
      if (savedLayout[axis]) applySize(axis, savedLayout[axis]);
      splitter.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        splitter.setPointerCapture(event.pointerId);
        document.body.classList.add('is-resizing-editor');
        document.body.dataset.resizeAxis = axis;
      });
      splitter.addEventListener('pointermove', (event) => {
        if (!splitter.hasPointerCapture(event.pointerId)) return;
        applySize(
          axis,
          axis === 'horizontal'
            ? window.innerHeight - event.clientY
            : window.innerWidth - event.clientX,
        );
      });
      splitter.addEventListener('pointerup', (event) => {
        if (!splitter.hasPointerCapture(event.pointerId)) return;
        splitter.releasePointerCapture(event.pointerId);
        document.body.classList.remove('is-resizing-editor');
        delete document.body.dataset.resizeAxis;
        const property =
          axis === 'horizontal'
            ? '--editor-timeline-h'
            : '--editor-inspector-w';
        saveSize(axis, parseInt(root.style.getPropertyValue(property), 10));
      });
      splitter.addEventListener('keydown', (event) => {
        const direction =
          axis === 'horizontal'
            ? { ArrowUp: 1, ArrowDown: -1 }[event.key] || 0
            : { ArrowLeft: 1, ArrowRight: -1 }[event.key] || 0;
        if (!direction) return;
        event.preventDefault();
        const pane =
          axis === 'horizontal'
            ? this.timelineSplitter?.nextElementSibling
            : this.videoInspector;
        const current =
          axis === 'horizontal'
            ? pane?.getBoundingClientRect().height
            : pane?.getBoundingClientRect().width;
        saveSize(axis, applySize(axis, current + direction * 20));
      });
      splitter.addEventListener('dblclick', () => {
        delete savedLayout[axis];
        root.style.removeProperty(
          axis === 'horizontal'
            ? '--editor-timeline-h'
            : '--editor-inspector-w',
        );
        this.preferences.saveJsonStorage(
          'hatewebcam-editor-layout',
          savedLayout,
        );
      });
    };
    bind(this.inspectorSplitter, 'vertical');
    bind(this.timelineSplitter, 'horizontal');
  };

  // Editor-only listeners are attached when the lazy editor chunk loads.
  proto.bindVideoEditorEvents = function () {
    if (this._videoEditorEventsBound) return;
    this._videoEditorEventsBound = true;
    if (this.videoEffectType) {
      this.videoEffectType.addEventListener('change', () => {
        this.updateEffectTrackHighlight();
        this.updateTimelineHint();
        if (this.sourceMode === 'video' && this.inspectorTab === 'adjust') {
          this.setAdjustmentsContext(this.videoEffectType.value);
        }
      });
    }
    this.videoTrimStart.addEventListener('change', () => {
      this.pushTimelineHistory();
      this.applyVideoTrim();
    });
    this.videoTrimEnd.addEventListener('change', () => {
      this.pushTimelineHistory();
      this.applyVideoTrim();
    });
    this.btnSetTrimFromPlayhead.addEventListener('click', () => {
      this.videoTrimStart.value = String(this.videoEl.currentTime || 0);
      this.pushTimelineHistory();
      this.applyVideoTrim();
    });
    this.btnSetTrimEndFromPlayhead.addEventListener('click', () => {
      this.videoTrimEnd.value = String(this.videoEl.currentTime || 0);
      this.pushTimelineHistory();
      this.applyVideoTrim();
    });
    if (this.btnOpenEffectAdjust) {
      this.btnOpenEffectAdjust.addEventListener('click', () => {
        const item = this.editor.timeline.items.find(
          (candidate) => candidate.id === this.selectedVideoEffectId,
        );
        if (item) this.openAdjustmentsForContext(item.type);
      });
    }
    if (this.videoEffectStart) {
      this.videoEffectStart.addEventListener('change', () =>
        this.commitSelectedEffectTiming({ pushHistory: true }),
      );
    }
    if (this.videoEffectEnd) {
      this.videoEffectEnd.addEventListener('change', () =>
        this.commitSelectedEffectTiming({ pushHistory: true }),
      );
    }
    if (this.videoEffectAutomationSelect) {
      this.videoEffectAutomationSelect.addEventListener('change', () =>
        this.commitSelectedEffectAutomation(),
      );
    }
    this.btnDeleteVideoEffect.addEventListener(
      'click',
      this.deleteSelectedVideoEffect.bind(this),
    );
    if (this.btnToolSelect)
      this.btnToolSelect.addEventListener('click', () =>
        this.setEditorTool('select'),
      );
    if (this.btnToolTrim)
      this.btnToolTrim.addEventListener('click', () =>
        this.setEditorTool('cut'),
      );
    if (this.btnCutAtMarkers)
      this.btnCutAtMarkers.addEventListener(
        'click',
        this.splitAllEffectsAtMarkers.bind(this),
      );
    if (this.btnTimelineZoomIn)
      this.btnTimelineZoomIn.addEventListener('click', () => {
        this.timelineZoom = this.clamp(this.timelineZoom + 0.5, 1, 8);
        this.applyTimelineZoom();
      });
    if (this.btnTimelineZoomOut)
      this.btnTimelineZoomOut.addEventListener('click', () => {
        this.timelineZoom = this.clamp(this.timelineZoom - 0.5, 1, 8);
        this.applyTimelineZoom();
      });
    if (this.timelineZoomInput)
      this.timelineZoomInput.addEventListener('input', () => {
        this.timelineZoom = this.clamp(
          Number(this.timelineZoomInput.value) || 1,
          1,
          8,
        );
        this.applyTimelineZoom();
      });
    if (this.timelineViewport) {
      this.timelineViewport.addEventListener(
        'wheel',
        (event) => {
          if (!event.ctrlKey || this.sourceMode !== 'video') return;
          event.preventDefault();
          this.timelineZoom = this.clamp(
            this.timelineZoom + (event.deltaY < 0 ? 0.25 : -0.25),
            1,
            8,
          );
          this.applyTimelineZoom();
        },
        { passive: false },
      );
    }
    if (this.btnEditorUndo)
      this.btnEditorUndo.addEventListener(
        'click',
        this.undoTimelineEdit.bind(this),
      );
    if (this.btnEditorRedo)
      this.btnEditorRedo.addEventListener(
        'click',
        this.redoTimelineEdit.bind(this),
      );
    this.inspectorTabs.forEach((tab) => {
      tab.addEventListener('click', () =>
        this.setInspectorTab(tab.dataset.tab),
      );
    });
    this.adjustContextNav
      ?.querySelectorAll('.adjust-context-tab')
      .forEach((tab) => {
        tab.addEventListener('click', () => {
          this.openAdjustmentsForContext(tab.dataset.adjustContext);
        });
      });
    this.videoTimelineEl
      ?.querySelectorAll('.timeline-track-label[data-adjust-context]')
      .forEach((label) => {
        label.addEventListener('click', (event) => {
          const context = label.dataset.adjustContext;
          const options = {};
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
        });
      });
    document.addEventListener(
      'keydown',
      this.handleVideoEditorKeydown.bind(this),
    );
    window.addEventListener('resize', () => {
      if (this.sourceMode === 'video') this.applyTimelineZoom();
    });
    if (this.timelinePlayheadHandle)
      this.timelinePlayheadHandle.addEventListener(
        'pointerdown',
        this.beginPlayheadDrag.bind(this),
      );
    if (this.timelineTrackArea)
      this.timelineTrackArea.addEventListener(
        'pointerdown',
        this.beginTimelineSelection.bind(this),
      );
    this.timelineTrackArea.addEventListener(
      'pointermove',
      this.updateTimelineCutGuide.bind(this),
    );
    this.timelineTrackArea.addEventListener('pointerleave', () =>
      this.hideTimelineCutGuide(),
    );
    this.timelineTrimStartHandle.addEventListener('pointerdown', (event) =>
      this.beginTrimDrag(event, 'start'),
    );
    this.timelineTrimEndHandle.addEventListener('pointerdown', (event) =>
      this.beginTrimDrag(event, 'end'),
    );
  };
}

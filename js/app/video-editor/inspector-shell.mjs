import { updateEditorUiState } from '../../../src/lib/editor/editor-state.ts';
import { translateCurrent } from '../../../src/lib/i18n/translate.ts';

/** @param {import('../controller.mjs').AppController} proto */
export function applyVideoEditorInspectorShellMixin(proto) {
  proto.commitSelectedEffectAutomation = function () {
    const item = this.getSelectedVideoEffectItem();
    if (!item) return;
    this.pushTimelineHistory();
    this.videoTimeline.upsert({
      ...item,
      config: {
        ...(item.config || {}),
        automation: this.getSelectedAutomationMode(),
      },
    });
    this.renderVideoTimeline();
    void this.syncVideoTimelineEffects(true);
  };

  proto.updateTimelineClipboardStatus = function (message = '') {
    if (!this.timelineClipboardStatus) return;
    this.timelineClipboardStatus.textContent = message;
    this.timelineClipboardStatus.classList.toggle('is-active', !!message);
  };

  proto.mountVideoEffectsControls = function () {
    if (!this.effectsControlsSlot || !this.inspectorAdjustmentsHost) return;
    if (
      this.effectsControlsSlot.parentElement !== this.inspectorAdjustmentsHost
    ) {
      this.inspectorAdjustmentsHost.appendChild(this.effectsControlsSlot);
    }
    this.effectsControlsSlot.classList.add('is-contextual');
    this.publishWebcamPanel?.();
    this.setAdvancedOptionsVisible(true);
    this.updateAdjustmentsPanelState();
  };

  proto.unmountVideoEffectsControls = function () {
    if (!this.effectsControlsSlot || !this.controlPanel) return;
    this.effectsControlsSlot.classList.remove('is-contextual');
    this.publishWebcamPanel?.();
    delete this.effectsControlsSlot.dataset.adjustContext;
    this.adjustContextNav?.classList.add('hidden');
    this.effectsControlsSlot
      .querySelectorAll('.adjust-context-group')
      .forEach((group) => {
        group.classList.remove('is-active');
      });
    this.videoTimelineEl
      ?.querySelectorAll('.timeline-track-label[data-adjust-context]')
      .forEach((label) => {
        label.classList.remove('is-active');
      });
    const cfg = this.loadConfig();
    this.setAdvancedOptionsVisible(!!cfg.showAdvancedOptions);
    const sourceSection = this.controlPanel.querySelector('#sourcePanel');
    if (
      sourceSection &&
      this.effectsControlsSlot.parentElement !== this.controlPanel
    ) {
      sourceSection.insertAdjacentElement('afterend', this.effectsControlsSlot);
    }
  };

  proto.resolveAdjustmentsContext = function () {
    const selected = this.getSelectedVideoEffectItem();
    if (selected) return selected.type;
    return 'look';
  };

  proto.setAdjustmentsContext = function (context, options = {}) {
    if (!this.getSelectedVideoEffectItem()) return;
    if (context === 'video') context = 'look';
    if (!context || !this.ADJUST_CONTEXT_HELP[context]) return;
    this.adjustmentsContext = context;
    if (this.effectsControlsSlot) {
      this.effectsControlsSlot.dataset.adjustContext = context;
    }
    this.adjustContextNav
      ?.querySelectorAll('.adjust-context-tab')
      .forEach((tab) => {
        const active = tab.dataset.adjustContext === context;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
    this.effectsControlsSlot
      ?.querySelectorAll('.adjust-context-group')
      .forEach((group) => {
        group.classList.toggle(
          'is-active',
          group.dataset.adjustContext === context,
        );
      });
    this.videoTimelineEl
      ?.querySelectorAll('.timeline-track-label[data-adjust-context]')
      .forEach((label) => {
        label.classList.toggle(
          'is-active',
          label.dataset.adjustContext === context,
        );
      });
    if (this.adjustContextHelp) {
      const help =
        this.ADJUST_CONTEXT_VIDEO_HELP?.[context] ||
        this.ADJUST_CONTEXT_HELP[context];
      this.adjustContextHelp.textContent = translateCurrent(help);
    }
    this.updateAdjustmentsClipStatus();
    this.publishWebcamPanel?.();
    if (options.syncEffectType && this.videoEffectType) {
      this.videoEffectType.value = options.effectType || context;
      this.updateEffectTrackHighlight();
      this.updateTimelineHint();
    }
    if (options.syncTool) {
      if (options.tool === 'trim') {
        this.setEditorTool('trim', { skipTab: true });
      } else if (options.tool === 'effect') {
        this.setEditorTool('select', { skipTab: true });
        if (this.videoEffectType) {
          this.videoEffectType.value =
            options.effectType || (context === 'look' ? 'look' : context);
        }
        this.updateEffectTrackHighlight();
        this.updateTimelineHint();
      }
    }
  };

  proto.updateAdjustmentsContext = function (options = {}) {
    if (this.sourceMode !== 'video') return;
    if (!this.getSelectedVideoEffectItem()) {
      this.updateAdjustmentsPanelState();
      return;
    }
    this.setAdjustmentsContext(this.resolveAdjustmentsContext(), options);
  };

  proto.openAdjustmentsForContext = function (context, options = {}) {
    if (this.sourceMode !== 'video') return;
    this.setAdjustmentsContext(context, options);
    this.setInspectorTab('adjust');
  };

  proto.updateEffectTrackHighlight = function (activeType = null) {
    if (!this.videoTimelineEl) return;
    const selected = this.videoTimeline.items.find(
      (item) => item.id === this.selectedVideoEffectId,
    );
    const type =
      activeType || this.paletteDragState?.type || selected?.type || null;
    this.videoTimelineEl
      .querySelectorAll('.timeline-track-effects')
      .forEach((track) => {
        track.classList.toggle(
          'is-target-track',
          !!type && track.dataset.track === type,
        );
      });
  };

  proto.setInspectorTab = function (tabName) {
    this.inspectorTab = tabName;
    updateEditorUiState({ inspectorTab: tabName });
    if (tabName === 'adjust' && this.sourceMode === 'video') {
      this.updateAdjustmentsPanelState();
    }
  };

  proto.setEditorTool = function (tool) {
    this.editorTool = tool;
    document.body.dataset.editorTool = tool;
    if (this.videoTimelineEl) this.videoTimelineEl.dataset.editorTool = tool;
    [this.btnToolSelect, this.btnToolTrim].forEach((button) => {
      if (!button) return;
      button.classList.toggle('is-active', button.dataset.tool === tool);
    });
    this.updateTimelineHint();
    this.updateEffectTrackHighlight();
    if (tool !== 'cut') this.hideTimelineCutGuide();
    if (this.sourceMode === 'video' && this.inspectorTab === 'adjust') {
      this.updateAdjustmentsPanelState();
    }
  };

  proto.updateTimelineHint = function () {
    if (!this.timelineHintText) return;
    if (!this.videoSourceFile) {
      this.timelineHintText.textContent = '';
      return;
    }
    const hints = {
      select:
        'Arrastrá para seleccionar varios, mové clips o presioná M para marcar.',
      cut: 'La línea roja marca el corte. Click sobre un clip de efecto.',
      trim: 'Arrastrá los bordes rojos en VIDEO.',
    };
    this.timelineHintText.textContent = translateCurrent(
      hints[this.editorTool] || hints.select,
    );
  };
}

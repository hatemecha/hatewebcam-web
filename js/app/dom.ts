function element<T extends HTMLElement = HTMLElement>(selector: string) {
  return document.querySelector<T>(selector);
}

function required<T extends HTMLElement = HTMLElement>(selector: string): T {
  const reference = element<T>(selector);
  if (!reference) throw new Error('HateWebcam: falta el elemento ' + selector);
  return reference;
}

export function readAppDom() {
  const canvas = required<HTMLCanvasElement>('#previewCanvas');
  const ctx =
    canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
  if (!ctx) throw new Error('HateWebcam: no se pudo iniciar el contexto 2D.');
  const videoTimelineEl = element('#videoTimeline');

  return {
    canvas,
    ctx,
    videoEl: required<HTMLVideoElement>('#videoElement'),
    btnToggleCamera: required<HTMLButtonElement>('#btnToggleCamera'),
    cameraSelect: required<HTMLSelectElement>('#cameraSelect'),
    timelineTrackArea:
      videoTimelineEl?.querySelector<HTMLElement>('.timeline-track-area') ??
      null,
    inspectorTabs: document.querySelectorAll<HTMLButtonElement>(
      '.video-inspector-tab',
    ),
    presetButtons: document.querySelectorAll<HTMLButtonElement>('.preset-btn'),
    mobilePresetButtons: document.querySelectorAll<HTMLButtonElement>(
      '.mobile-preset-chip',
    ),
    previewWrapper: element('#previewWrapper'),
    previewQualityDiagnostic: element('#previewQualityDiagnostic'),
    detectorChipBlob: element('#detectorChipBlob'),
    detectorChipFace: element('#detectorChipFace'),
    detectorChipBlink: element('#detectorChipBlink'),
    videoEditorStatus: element('#videoEditorStatus'),
    videoTimelineEl,
    timelineTrim: required('#timelineTrim'),
    timelineTrimStartHandle: required<HTMLButtonElement>(
      '#timelineTrimStartHandle',
    ),
    timelineTrimEndHandle: required<HTMLButtonElement>(
      '#timelineTrimEndHandle',
    ),
    timelinePlayhead: required('#timelinePlayhead'),
    timelineSelection: element('#timelineSelection'),
    timelineMarkers: element('#timelineMarkers'),
    timelineItems: element('#timelineItems'),
    timelineEffectPalette: element('#timelineEffectPalette'),
    videoEffectRangeLabel: element('#videoEffectRangeLabel'),
    videoTrimStart: required<HTMLInputElement>('#videoTrimStart'),
    videoTrimEnd: required<HTMLInputElement>('#videoTrimEnd'),
    btnSetTrimFromPlayhead: element<HTMLButtonElement>(
      '#btnSetTrimFromPlayhead',
    ),
    btnSetTrimEndFromPlayhead: element<HTMLButtonElement>(
      '#btnSetTrimEndFromPlayhead',
    ),
    videoEffectType: required<HTMLSelectElement>('#videoEffectType'),
    videoEffectStart: required<HTMLInputElement>('#videoEffectStart'),
    videoEffectEnd: required<HTMLInputElement>('#videoEffectEnd'),
    videoEffectAutomationSelect: element<HTMLSelectElement>(
      '#videoEffectAutomationSelect',
    ),
    videoEffectClipMeta: element('#videoEffectClipMeta'),
    videoEffectTypeLabel: element('#videoEffectTypeLabel'),
    videoEffectDurationLabel: element('#videoEffectDurationLabel'),
    btnOpenEffectAdjust: element<HTMLButtonElement>('#btnOpenEffectAdjust'),
    btnDeleteVideoEffect: element<HTMLButtonElement>('#btnDeleteVideoEffect'),
    btnToolSelect: element<HTMLButtonElement>('#btnToolSelect'),
    btnToolTrim: element<HTMLButtonElement>('#btnToolTrim'),
    btnCutAtMarkers: element<HTMLButtonElement>('#btnCutAtMarkers'),
    btnTimelineZoomIn: element<HTMLButtonElement>('#btnTimelineZoomIn'),
    btnTimelineZoomOut: element<HTMLButtonElement>('#btnTimelineZoomOut'),
    timelineZoomInput: element<HTMLInputElement>('#timelineZoom'),
    timelineViewport: element('#timelineViewport'),
    timelineScroll: element('#timelineScroll'),
    timelineTimeRuler: element('#timelineTimeRuler'),
    timelineVideoClip: element('#timelineVideoClip'),
    timelineTrimOutsideStart: element('#timelineTrimOutsideStart'),
    timelineTrimOutsideEnd: element('#timelineTrimOutsideEnd'),
    timelinePlayheadHandle: element<HTMLButtonElement>(
      '#timelinePlayheadHandle',
    ),
    timelineCutGuide: element('#timelineCutGuide'),
    timelineHintText: element('#timelineHintText'),
    timelineClipboardStatus: element('#timelineClipboardStatus'),
    chkTimelineSnap: element<HTMLInputElement>('#chkTimelineSnap'),
    btnEditorUndo: element<HTMLButtonElement>('#btnEditorUndo'),
    btnEditorRedo: element<HTMLButtonElement>('#btnEditorRedo'),
    videoInspector: element('#videoInspector'),
    inspectorSplitter: element('#inspectorSplitter'),
    timelineSplitter: element('#timelineSplitter'),
    inspectorAdjustmentsHost: element('#inspectorAdjustmentsHost'),
    visualFxInspectorHost: element('#visualFxInspectorHost'),
    inspectorAdjustNoVideo: element('#inspectorAdjustNoVideo'),
    inspectorAdjustNoClip: element('#inspectorAdjustNoClip'),
    videoEffectEmptyNoVideo: element('#videoEffectEmptyNoVideo'),
    effectsControlsSlot: element('#effectsControlsSlot'),
    videoEffectEmptyHint: element('#videoEffectEmptyHint'),
    captureStatus: element('#captureStatus'),
    sldJpegQuality: element('#sldJpegQuality'),
    valJpegQuality: element('#valJpegQuality'),
    videoFormatSelect: element<HTMLSelectElement>('#videoFormatSelect'),
    chkQualityEnhancer: element<HTMLInputElement>('#chkQualityEnhancer'),
    chkShutterSound: element<HTMLInputElement>('#chkShutterSound'),
    sldQualityEnhancerStrength: element('#sldQualityEnhancerStrength'),
    valQualityEnhancerStrength: element('#valQualityEnhancerStrength'),
    qualityEnhancerStrengthGroup: element('#qualityEnhancerStrengthGroup'),
    controlPanel: element('#controlPanel'),
    chkBlackWhite: element<HTMLInputElement>('#chkBlackWhite'),
    sldExposure: element('#sldExposure'),
    valExposure: element('#valExposure'),
    sldShadows: element('#sldShadows'),
    valShadows: element('#valShadows'),
    sldHighlights: element('#sldHighlights'),
    valHighlights: element('#valHighlights'),
    sldContrast: element('#sldContrast'),
    valContrast: element('#valContrast'),
    sldSaturation: element('#sldSaturation'),
    valSaturation: element('#valSaturation'),
    sldTemperature: element('#sldTemperature'),
    valTemperature: element('#valTemperature'),
    sldDetail: element('#sldDetail'),
    valDetail: element('#valDetail'),
    sldSharpness: element('#sldSharpness'),
    valSharpness: element('#valSharpness'),
    inpBlobQuickColor: element<HTMLInputElement>('#inpBlobQuickColor'),
    blobQuickColorSwatch: element('#blobQuickColorSwatch'),
    inpFaceQuickColor: element<HTMLInputElement>('#inpFaceQuickColor'),
    faceQuickColorChip: element('#faceQuickColorChip'),
    faceQuickColorSwatch: element('#faceQuickColorSwatch'),
    faceQuickControls: element('#faceQuickControls'),
    faceQuickLabelWrap: element('#faceQuickLabelWrap'),
    chkFaceShowBox: element<HTMLInputElement>('#chkFaceShowBox'),
    chkFaceShowBlur: element<HTMLInputElement>('#chkFaceShowBlur'),
    inpFaceQuickLabel: element<HTMLInputElement>('#inpFaceQuickLabel'),
    colorPickSection: element('#colorPickSection'),
    btnToggleAdvancedOptions: element<HTMLButtonElement>(
      '#btnToggleAdvancedOptions',
    ),
    advancedOptions: element('#advancedOptions'),
    adjustContextNav: element('#adjustContextNav'),
    adjustContextHelp: element('#adjustContextHelp'),
    adjustClipStatus: element('#adjustClipStatus'),
    profileSelect: element<HTMLSelectElement>('#profileSelect'),
    profileStatus: element('#profileStatus'),
  };
}

function element<T extends HTMLElement = HTMLElement>(selector: string) {
  return document.querySelector<T>(selector);
}

function required<T extends HTMLElement = HTMLElement>(selector: string): T {
  const reference = element<T>(selector);
  if (!reference) throw new Error('HateWebcam: falta el elemento ' + selector);
  return reference;
}

export function readAppDom() {
  required('#btnToggleCamera');
  required('#cameraSelect');
  const canvas = required<HTMLCanvasElement>('#previewCanvas');
  const ctx =
    canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
  if (!ctx) throw new Error('HateWebcam: no se pudo iniciar el contexto 2D.');
  const videoTimelineEl = element('#videoTimeline');

  return {
    canvas,
    ctx,
    videoEl: required<HTMLVideoElement>('#videoElement'),
    timelineTrackArea:
      videoTimelineEl?.querySelector<HTMLElement>('.timeline-track-area') ??
      null,
    previewWrapper: element('#previewWrapper'),
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
    videoInspector: element('#videoInspector'),
    inspectorSplitter: element('#inspectorSplitter'),
    timelineSplitter: element('#timelineSplitter'),
    inspectorAdjustmentsHost: element('#inspectorAdjustmentsHost'),
    visualFxInspectorHost: element('#visualFxInspectorHost'),
    effectsControlsSlot: element('#effectsControlsSlot'),
    captureStatus: element('#captureStatus'),
    controlPanel: element('#controlPanel'),
    profileStatus: element('#profileStatus'),
  };
}

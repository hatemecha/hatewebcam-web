/**
 * HateWebcam Web — application entry point.
 */
import { WebcamApplication } from './app/application.ts';
import {
  getLocale,
  initializeI18n,
  setLocale,
  subscribeLocale,
} from '../src/lib/i18n/locale-state.ts';
import { translateCurrent } from '../src/lib/i18n/translate.ts';
import { mountAppHeader, mountSkipLink } from '../src/lib/shell/mount.ts';
import { updateShellState } from '../src/lib/shell/shell-bridge.ts';
import {
  mountDetectorChips,
  mountPreviewPlaceholder,
} from '../src/lib/preview/mount.ts';
import {
  mountCaptureModal,
  mountExportModal,
} from '../src/lib/modals/mount.ts';
import { mountCameraSource } from '../src/lib/webcam/mount.ts';
import { mountEffectsControls } from '../src/lib/webcam/effects-mount.ts';
import { mountPreviewMetrics } from '../src/lib/preview/metrics-mount.ts';
import {
  mountCaptureBar,
  mountCaptureChrome,
  mountMobileHud,
} from '../src/lib/capture/mount.ts';
import { mountVideoEditor } from '../src/lib/editor/mount.ts';

import { hideStatus } from './app/feedback.ts';

initializeI18n();
let app: WebcamApplication;
let appReady = false;
const pendingActions: (() => void)[] = [];

/**
 * Run a controller action now, or as soon as startup finishes. Interactions
 * that land while settings load must not be silently discarded.
 */
function whenAppReady(action: () => void) {
  if (appReady) {
    action();
    return;
  }
  pendingActions.push(action);
}

function markAppReady() {
  appReady = true;
  for (const action of pendingActions.splice(0)) action();
}

try {
  mountSkipLink(document.querySelector<HTMLElement>('#skipLinkMount'));
  mountVideoEditor(
    document.querySelector<HTMLElement>('#videoEditorTemplateSlot'),
    {
      loadVideo: (file) => whenAppReady(() => void app.importVideoFile(file)),
      loadProject: (file) =>
        whenAppReady(() => void app.importEditorProjectFile(file)),
      saveProject: () => whenAppReady(() => app.editor?.projects.save()),
      startExport: () =>
        whenAppReady(() => void app.editor?.exporter.startVideoExport()),
      setExportSetting: (setting, value) =>
        whenAppReady(() => app.preferences.setExportSetting(setting, value)),
    },
  );
  mountPreviewPlaceholder(
    document.querySelector<HTMLElement>('#previewPlaceholderMount'),
    {
      startCamera: () => whenAppReady(() => void app.camera.toggleCamera(true)),
      chooseVideo: () =>
        document.querySelector<HTMLInputElement>('#videoFileInput')?.click(),
    },
  );
  mountCaptureBar(document.querySelector<HTMLElement>('#captureBarMount'), {
    takePhoto: () => {
      whenAppReady(() => app.capture.requestPhotoCapture());
    },
    toggleRecording: () => {
      whenAppReady(() => app.capture.toggleRecording());
    },
    setCaptureTimer: (seconds) => {
      whenAppReady(() => app.preferences.setCaptureTimerSeconds(seconds));
    },
  });
  mountAppHeader(
    document.querySelector<HTMLElement>('#appHeaderMount'),
    {
      setSourceMode: (mode) => {
        whenAppReady(() => app.setSourceMode(mode));
      },
      startVideoExport: () => {
        whenAppReady(() => void app.editor?.exporter.startVideoExport());
      },
      setLocale: (locale) => {
        setLocale(locale);
        updateShellState({ locale });
      },
    },
    { mode: 'camera', exportEnabled: false, locale: getLocale() },
  );
  mountCameraSource(document.querySelector<HTMLElement>('#cameraSourceMount'), {
    toggleCamera: () => {
      whenAppReady(() => void app.camera.toggleCamera());
    },
    selectCamera: (deviceId) => {
      whenAppReady(() => void app.camera.selectCamera(deviceId));
    },
    setPerformanceMode: (mode) => {
      whenAppReady(() => {
        void app.camera.applyPerformanceMode(mode, {
          restartCamera: true,
          notify: true,
        });
      });
    },
    toggleMirror: () => {
      whenAppReady(() => app.preferences.toggleMirrorQuick());
    },
  });
  mountPreviewMetrics(
    document.querySelector<HTMLElement>('#previewMetricsMount'),
  );
  mountEffectsControls(
    document.querySelector<HTMLElement>('#effectsControlsSlot'),
    {
      toggleDetector: (type, checked) => {
        whenAppReady(() => {
          app.handleDetectorToggle(type, checked);
        });
      },
      setBlobColor: (color) => {
        whenAppReady(() => app.preferences.setQuickBlobColor(color));
      },
      setFaceColor: (color) => {
        whenAppReady(() => app.preferences.setQuickFaceColor(color));
      },
      setFaceLabel: (value) => {
        whenAppReady(() => app.preferences.setQuickFaceLabel(value));
      },
      commitFaceLabel: (value) => {
        whenAppReady(() => app.preferences.commitQuickFaceLabel(value));
      },
      setFaceVisual: (kind, checked) => {
        whenAppReady(() => app.preferences.setFaceVisualChecked(kind, checked));
      },
      pickColor: (target) => {
        whenAppReady(() => app.colorPicker.start(target));
      },
      setDetectorOptions: (...update) =>
        whenAppReady(() => app.preferences.setDetectorOptions(...update)),
      setTargetColor: (color) =>
        whenAppReady(() => app.preferences.setTargetColor(color)),
      toggleAdvanced: () => {
        whenAppReady(() => app.preferences.toggleAdvancedOptions());
      },
      setImageNumber: (key, value) => {
        whenAppReady(() => app.preferences.setPanelImageNumber(key, value));
      },
      setBlackAndWhite: (checked) => {
        whenAppReady(() => app.preferences.setPanelBlackAndWhite(checked));
      },
      setVideoFormat: (format) => {
        whenAppReady(() => app.preferences.setPanelVideoFormat(format));
      },
      setQualityEnhancer: (checked) => {
        whenAppReady(() => app.preferences.setPanelQualityEnhancer(checked));
      },
      setShutterSound: (checked) => {
        whenAppReady(() => app.preferences.setPanelShutterSound(checked));
      },
      setFlipH: (flipH) =>
        whenAppReady(() => app.camera.setTransform({ flipH })),
      setFlipV: (flipV) =>
        whenAppReady(() => app.camera.setTransform({ flipV })),
      setRotation: (rotation) =>
        whenAppReady(() => app.camera.setTransform({ rotation })),
      applyPreset: (name) => {
        whenAppReady(() => app.preferences.applyImagePreset(name));
      },
      resetImage: () => {
        whenAppReady(() => app.preferences.resetImageAdjustments());
      },
      saveProfile: () => {
        whenAppReady(() => app.profiles.saveCurrent());
      },
      deleteProfile: () => {
        whenAppReady(() => app.profiles.deleteSelected());
      },
      deleteAllProfiles: () => {
        whenAppReady(() => app.profiles.deleteAll());
      },
      selectProfile: (name) => {
        whenAppReady(() => void app.profiles.select(name));
      },
      resetWebcam: () => {
        whenAppReady(() => void app.preferences.resetWebcamConfiguration());
      },
      openAdjustContext: (context) => {
        whenAppReady(() =>
          app.editor?.workspace.openAdjustmentsForContext(context),
        );
      },
    },
  );
  mountCaptureChrome(
    document.querySelector<HTMLElement>('#captureStatusMount'),
  );
  mountMobileHud(document.querySelector<HTMLElement>('#mobileHudMount'), {
    toggleEffects: () => {
      whenAppReady(() =>
        app.preferences.setMobileFxPanelVisible(
          !app.preferences.isMobileFxPanelVisible(),
        ),
      );
    },
    closeEffects: () => {
      whenAppReady(() => app.preferences.setMobileFxPanelVisible(false));
    },
    toggleMirror: () => {
      whenAppReady(() => app.preferences.toggleMirrorQuick());
    },
    takePhoto: () => {
      whenAppReady(() => {
        app.preferences.setMobileFxPanelVisible(false);
        app.capture.requestPhotoCapture();
      });
    },
    toggleRecording: () => {
      whenAppReady(() => {
        app.preferences.setMobileFxPanelVisible(false);
        app.capture.toggleRecording();
      });
    },
    toggleDetector: (type, checked) => {
      whenAppReady(() => {
        app.handleDetectorToggle(type, checked);
      });
    },
    pickColor: () => {
      whenAppReady(() => {
        app.colorPicker.start();
        app.preferences.setMobileFxPanelVisible(false);
      });
    },
    setBlobColor: (color) => {
      whenAppReady(() => app.preferences.setQuickBlobColor(color));
    },
    setFaceColor: (color) => {
      whenAppReady(() => app.preferences.setQuickFaceColor(color));
    },
    setFaceVisual: (kind, checked) => {
      whenAppReady(() => app.preferences.setFaceVisualChecked(kind, checked));
    },
    setFaceLabel: (value) => {
      whenAppReady(() => app.preferences.setQuickFaceLabel(value));
    },
    commitFaceLabel: (value) => {
      whenAppReady(() => app.preferences.commitQuickFaceLabel(value));
    },
    applyPreset: (name) => {
      whenAppReady(() => app.preferences.applyImagePreset(name));
    },
    setCaptureTimer: (seconds) => {
      whenAppReady(() => app.preferences.setCaptureTimerSeconds(seconds));
    },
  });
  mountDetectorChips(document.querySelector<HTMLElement>('#effectsInfo'));
  mountCaptureModal(
    document.querySelector<HTMLElement>('#captureModalTemplateSlot'),
    {
      download: () => {
        whenAppReady(() => app.capture.downloadPendingCapture());
      },
      discard: () => {
        whenAppReady(() => app.capture.closeCapturePreview(true));
      },
      setEnhancer: (enabled) => {
        whenAppReady(() => app.capture.onPreviewPhotoEnhancerToggle(enabled));
      },
      setEnhancerStrength: (strength) => {
        whenAppReady(() =>
          app.capture.onPreviewPhotoEnhancerStrengthInput(strength),
        );
      },
    },
  );
  mountExportModal(
    document.querySelector<HTMLElement>('#exportModalTemplateSlot'),
    {
      cancel: () => {
        whenAppReady(() => void app.editor?.exporter.cancelVideoExport());
      },
      close: () => {
        whenAppReady(() => app.editor?.exporter.closeVideoExportModal());
      },
    },
  );
  app = new WebcamApplication();
  const lifecycle = await app.start();
  markAppReady();
  const refreshLocalizedUi = () => {
    if (lifecycle.signal.aborted) return;
    app.detectors.updateInfo(true);
    app.editor?.exporter.updateVideoEditorUI();
    app.editor?.workspace.refreshLocale();
    hideStatus(app.dom.videoEditorStatus);
    app.preferences.publishWebcamPanel();
    app.capture.updateCaptureButtons();
    app.capture.publishCapturePreview();
    app.capture.publishCaptureChrome();
    updateShellState({ locale: getLocale() });
  };
  const unsubscribeLocale = subscribeLocale(() => {
    refreshLocalizedUi();
    requestAnimationFrame(refreshLocalizedUi);
  });
  lifecycle.signal.addEventListener('abort', unsubscribeLocale, { once: true });
} catch (err) {
  console.error(err);
  document.body.innerHTML = `
    <main class="boot-error" style="max-width: 42rem; margin: 12vh auto; padding: 2rem; font-family: system-ui, sans-serif; line-height: 1.5;">
      <h1>${translateCurrent('No se pudo iniciar HateWebcam')}</h1>
      <p>${translateCurrent('Revisá que estés sirviendo el proyecto desde localhost/https y que existan los templates.')}</p>
    </main>
  `;
}

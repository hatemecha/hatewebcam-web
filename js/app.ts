/**
 * HateWebcam Web — application entry point.
 */
import { AppController } from './app/controller.mjs';
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

interface ShellCommands {
  renderEffectConfig(): void;
  _adjustClipStatusKey: string;
  openAdjustmentsForContext?(context: string): void;
  startVideoExport?(): Promise<void>;
  cancelVideoExport?(): void;
  closeVideoExportModal?(): void;
  updateEditorExportControls?(): void;
  updateAdjustmentsContext?(): void;
  updateAdjustmentsClipStatus?(): void;
}

initializeI18n();
const controller = new AppController() as AppController & ShellCommands;
let controllerReady = false;
const pendingControllerActions: (() => void)[] = [];

/**
 * Run a controller action now, or as soon as startup finishes. Interactions
 * that land while settings load must not be silently discarded.
 */
function whenControllerReady(action: () => void) {
  if (controllerReady) {
    action();
    return;
  }
  pendingControllerActions.push(action);
}

function markControllerReady() {
  controllerReady = true;
  for (const action of pendingControllerActions.splice(0)) action();
}

try {
  mountSkipLink(document.querySelector<HTMLElement>('#skipLinkMount'));
  mountVideoEditor(
    document.querySelector<HTMLElement>('#videoEditorTemplateSlot'),
  );
  mountPreviewPlaceholder(
    document.querySelector<HTMLElement>('#previewPlaceholderMount'),
    {
      startCamera: () =>
        whenControllerReady(() => void controller.camera.toggleCamera(true)),
      chooseVideo: () =>
        document.querySelector<HTMLInputElement>('#videoFileInput')?.click(),
    },
  );
  mountCaptureBar(document.querySelector<HTMLElement>('#captureBarMount'), {
    takePhoto: () => {
      whenControllerReady(() => controller.capture.requestPhotoCapture());
    },
    toggleRecording: () => {
      whenControllerReady(() => controller.capture.toggleRecording());
    },
    setCaptureTimer: (seconds) => {
      whenControllerReady(() =>
        controller.preferences.setCaptureTimerSeconds(seconds),
      );
    },
  });
  mountAppHeader(
    document.querySelector<HTMLElement>('#appHeaderMount'),
    {
      setSourceMode: (mode) => {
        whenControllerReady(() => controller.setSourceMode(mode));
      },
      startVideoExport: () => {
        whenControllerReady(() => void controller.startVideoExport?.());
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
      whenControllerReady(() => void controller.camera.toggleCamera());
    },
    selectCamera: (deviceId) => {
      whenControllerReady(() => void controller.camera.selectCamera(deviceId));
    },
    setPerformanceMode: (mode) => {
      whenControllerReady(() => {
        void controller.camera.applyPerformanceMode(mode, {
          restartCamera: true,
          notify: true,
        });
      });
    },
    toggleMirror: () => {
      whenControllerReady(() => controller.preferences.toggleMirrorQuick());
    },
  });
  mountPreviewMetrics(
    document.querySelector<HTMLElement>('#previewMetricsMount'),
  );
  mountEffectsControls(
    document.querySelector<HTMLElement>('#effectsControlsSlot'),
    {
      toggleDetector: (type, checked) => {
        whenControllerReady(() => {
          controller.handleVideoDetectorToggle(type, checked);
        });
      },
      setBlobColor: (color) => {
        whenControllerReady(() =>
          controller.preferences.setQuickBlobColor(color),
        );
      },
      setFaceColor: (color) => {
        whenControllerReady(() =>
          controller.preferences.setQuickFaceColor(color),
        );
      },
      setFaceLabel: (value) => {
        whenControllerReady(() =>
          controller.preferences.setQuickFaceLabel(value),
        );
      },
      commitFaceLabel: (value) => {
        whenControllerReady(() =>
          controller.preferences.commitQuickFaceLabel(value),
        );
      },
      setFaceVisual: (kind, checked) => {
        whenControllerReady(() =>
          controller.preferences.setFaceVisualChecked(kind, checked),
        );
      },
      pickColor: () => {
        whenControllerReady(() => controller.colorPicker.start());
      },
      toggleAdvanced: () => {
        whenControllerReady(() =>
          controller.preferences.toggleAdvancedOptions(),
        );
      },
      setImageNumber: (key, value) => {
        whenControllerReady(() =>
          controller.preferences.setPanelImageNumber(key, value),
        );
      },
      setBlackAndWhite: (checked) => {
        whenControllerReady(() =>
          controller.preferences.setPanelBlackAndWhite(checked),
        );
      },
      setVideoFormat: (format) => {
        whenControllerReady(() =>
          controller.preferences.setPanelVideoFormat(format),
        );
      },
      setQualityEnhancer: (checked) => {
        whenControllerReady(() =>
          controller.preferences.setPanelQualityEnhancer(checked),
        );
      },
      setShutterSound: (checked) => {
        whenControllerReady(() =>
          controller.preferences.setPanelShutterSound(checked),
        );
      },
      setFlipH: (flipH) =>
        whenControllerReady(() => controller.camera.setTransform({ flipH })),
      setFlipV: (flipV) =>
        whenControllerReady(() => controller.camera.setTransform({ flipV })),
      setRotation: (rotation) =>
        whenControllerReady(() => controller.camera.setTransform({ rotation })),
      applyPreset: (name) => {
        whenControllerReady(() =>
          controller.preferences.applyImagePreset(name),
        );
      },
      resetImage: () => {
        whenControllerReady(() =>
          controller.preferences.resetImageAdjustments(),
        );
      },
      saveProfile: () => {
        whenControllerReady(() => controller.profiles.saveCurrent());
      },
      deleteProfile: () => {
        whenControllerReady(() => controller.profiles.deleteSelected());
      },
      deleteAllProfiles: () => {
        whenControllerReady(() => controller.profiles.deleteAll());
      },
      selectProfile: (name) => {
        whenControllerReady(() => void controller.profiles.select(name));
      },
      resetWebcam: () => {
        whenControllerReady(
          () => void controller.preferences.resetWebcamConfiguration(),
        );
      },
      openAdjustContext: (context) => {
        whenControllerReady(() =>
          controller.openAdjustmentsForContext?.(context),
        );
      },
    },
  );
  mountCaptureChrome(
    document.querySelector<HTMLElement>('#captureStatusMount'),
  );
  mountMobileHud(document.querySelector<HTMLElement>('#mobileHudMount'), {
    toggleEffects: () => {
      whenControllerReady(() =>
        controller.preferences.setMobileFxPanelVisible(
          !controller.preferences.isMobileFxPanelVisible(),
        ),
      );
    },
    closeEffects: () => {
      whenControllerReady(() =>
        controller.preferences.setMobileFxPanelVisible(false),
      );
    },
    toggleMirror: () => {
      whenControllerReady(() => controller.preferences.toggleMirrorQuick());
    },
    takePhoto: () => {
      whenControllerReady(() => {
        controller.preferences.setMobileFxPanelVisible(false);
        controller.capture.requestPhotoCapture();
      });
    },
    toggleRecording: () => {
      whenControllerReady(() => {
        controller.preferences.setMobileFxPanelVisible(false);
        controller.capture.toggleRecording();
      });
    },
    toggleDetector: (type, checked) => {
      whenControllerReady(() => {
        controller.handleVideoDetectorToggle(type, checked);
      });
    },
    pickColor: () => {
      whenControllerReady(() => {
        controller.colorPicker.start();
        controller.preferences.setMobileFxPanelVisible(false);
      });
    },
    setBlobColor: (color) => {
      whenControllerReady(() =>
        controller.preferences.setQuickBlobColor(color),
      );
    },
    setFaceColor: (color) => {
      whenControllerReady(() =>
        controller.preferences.setQuickFaceColor(color),
      );
    },
    setFaceVisual: (kind, checked) => {
      whenControllerReady(() =>
        controller.preferences.setFaceVisualChecked(kind, checked),
      );
    },
    setFaceLabel: (value) => {
      whenControllerReady(() =>
        controller.preferences.setQuickFaceLabel(value),
      );
    },
    commitFaceLabel: (value) => {
      whenControllerReady(() =>
        controller.preferences.commitQuickFaceLabel(value),
      );
    },
    applyPreset: (name) => {
      whenControllerReady(() => controller.preferences.applyImagePreset(name));
    },
    setCaptureTimer: (seconds) => {
      whenControllerReady(() =>
        controller.preferences.setCaptureTimerSeconds(seconds),
      );
    },
  });
  mountDetectorChips(document.querySelector<HTMLElement>('#effectsInfo'));
  mountCaptureModal(
    document.querySelector<HTMLElement>('#captureModalTemplateSlot'),
    {
      download: () => {
        whenControllerReady(() => controller.capture.downloadPendingCapture());
      },
      discard: () => {
        whenControllerReady(() => controller.capture.closeCapturePreview(true));
      },
      setEnhancer: (enabled) => {
        whenControllerReady(() =>
          controller.capture.onPreviewPhotoEnhancerToggle(enabled),
        );
      },
      setEnhancerStrength: (strength) => {
        whenControllerReady(() =>
          controller.capture.onPreviewPhotoEnhancerStrengthInput(strength),
        );
      },
    },
  );
  mountExportModal(
    document.querySelector<HTMLElement>('#exportModalTemplateSlot'),
    {
      cancel: () => {
        whenControllerReady(() => void controller.cancelVideoExport?.());
      },
      close: () => {
        whenControllerReady(() => controller.closeVideoExportModal?.());
      },
    },
  );
  await controller.start();
  markControllerReady();
  const refreshLocalizedUi = () => {
    controller.renderEffectConfig?.();
    controller.detectors.updateInfo?.(true);
    controller.updateVideoEditorUI?.();
    controller.updateEditorExportControls?.();
    controller._adjustClipStatusKey = '';
    controller.updateAdjustmentsContext?.();
    controller.updateAdjustmentsClipStatus?.();
    controller.updateTimelineHint?.();
    hideStatus(controller.dom?.videoEditorStatus);
    controller.preferences?.publishWebcamPanel();
    controller.capture?.updateCaptureButtons();
    controller.capture?.publishCapturePreview();
    controller.capture?.publishCaptureChrome();
    updateShellState({ locale: getLocale() });
  };
  subscribeLocale(() => {
    refreshLocalizedUi();
    requestAnimationFrame(refreshLocalizedUi);
  });
} catch (err) {
  console.error(err);
  document.body.innerHTML = `
    <main class="boot-error" style="max-width: 42rem; margin: 12vh auto; padding: 2rem; font-family: system-ui, sans-serif; line-height: 1.5;">
      <h1>${translateCurrent('No se pudo iniciar HateWebcam')}</h1>
      <p>${translateCurrent('Revisá que estés sirviendo el proyecto desde localhost/https y que existan los templates.')}</p>
    </main>
  `;
}

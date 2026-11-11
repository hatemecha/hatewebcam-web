/**
 * HateWebcam Web — application entry point.
 */
import { AppController } from './app/controller.mjs';
import { getLocale, initializeI18n, setLocale, translate } from './i18n.mjs';
import { subscribeLocale } from '../src/lib/i18n/locale-state.ts';
import { mountAppHeader, mountSkipLink } from '../src/lib/shell/mount.ts';
import { updateShellState } from '../src/lib/shell/shell-bridge.mjs';
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
import { updateCameraSourceState } from '../src/lib/webcam/camera-source-bridge.mjs';
import { mountPreviewMetrics } from '../src/lib/preview/metrics-mount.ts';
import {
  mountCaptureBar,
  mountCaptureChrome,
  mountMobileHud,
} from '../src/lib/capture/mount.ts';
import { mountVideoEditor } from '../src/lib/editor/mount.ts';

initializeI18n();
const controller = new AppController();
let controllerReady = false;
const pendingControllerActions = [];

/**
 * Run a controller action now, or as soon as startup finishes. Interactions
 * that land while settings load must not be silently discarded.
 */
function whenControllerReady(action) {
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
  mountSkipLink(document.querySelector('#skipLinkMount'));
  mountVideoEditor(document.querySelector('#videoEditorTemplateSlot'));
  mountPreviewPlaceholder(document.querySelector('#previewPlaceholderMount'));
  mountCaptureBar(document.querySelector('#captureBarMount'));
  mountAppHeader(
    document.querySelector('#appHeaderMount'),
    {
      setSourceMode: (mode) => {
        whenControllerReady(() => controller.setSourceMode(mode));
      },
      startVideoExport: () => {
        whenControllerReady(() => void controller.startVideoExport());
      },
      setLocale: (locale) => {
        setLocale(locale);
        updateShellState({ locale });
      },
    },
    { mode: 'camera', exportEnabled: false, locale: getLocale() },
  );
  mountCameraSource(document.querySelector('#cameraSourceMount'), {
    toggleCamera: () => {
      whenControllerReady(() => void controller.toggleCamera());
    },
    selectCamera: (deviceId) => {
      updateCameraSourceState({ deviceId });
      whenControllerReady(() => void controller.onCameraChange());
    },
    setPerformanceMode: (mode) => {
      whenControllerReady(() => {
        void controller.applyPerformanceMode(mode, {
          restartCamera: true,
          notify: true,
        });
      });
    },
    toggleMirror: () => {
      whenControllerReady(() => controller.toggleMirrorQuick());
    },
  });
  mountPreviewMetrics(document.querySelector('#previewMetricsMount'));
  mountEffectsControls(document.querySelector('#effectsControlsSlot'), {
    toggleDetector: (type, checked) => {
      whenControllerReady(() => {
        const input = controller.getTimelineDetectorCheckbox(type);
        if (input) input.checked = checked;
        controller.handleVideoDetectorToggle(type);
      });
    },
    setBlobColor: (color) => {
      whenControllerReady(() => controller.setQuickBlobColor(color));
    },
    setFaceColor: (color) => {
      whenControllerReady(() => controller.setQuickFaceColor(color));
    },
    setFaceLabel: (value) => {
      whenControllerReady(() => controller.setQuickFaceLabel(value));
    },
    commitFaceLabel: (value) => {
      whenControllerReady(() => controller.commitQuickFaceLabel(value));
    },
    setFaceVisual: (kind, checked) => {
      whenControllerReady(() => controller.setFaceVisualChecked(kind, checked));
    },
    pickColor: () => {
      whenControllerReady(() => controller.enableColorPick());
    },
    toggleAdvanced: () => {
      whenControllerReady(() => controller.toggleAdvancedOptions());
    },
    setImageNumber: (key, value) => {
      whenControllerReady(() => controller.setPanelImageNumber(key, value));
    },
    setBlackAndWhite: (checked) => {
      whenControllerReady(() => controller.setPanelBlackAndWhite(checked));
    },
    setVideoFormat: (format) => {
      whenControllerReady(() => controller.setPanelVideoFormat(format));
    },
    setQualityEnhancer: (checked) => {
      whenControllerReady(() => controller.setPanelQualityEnhancer(checked));
    },
    setShutterSound: (checked) => {
      whenControllerReady(() => controller.setPanelShutterSound(checked));
    },
    setFlipH: (checked) => {
      whenControllerReady(() => {
        controller.flipH = checked;
        if (controller.chkMirror) controller.chkMirror.checked = checked;
        controller.onTransformChange();
      });
    },
    setFlipV: (checked) => {
      whenControllerReady(() => {
        controller.flipV = checked;
        if (controller.chkFlipV) controller.chkFlipV.checked = checked;
        controller.onTransformChange();
      });
    },
    setRotation: (value) => {
      whenControllerReady(() => {
        controller.rotation = value;
        if (controller.rotationSelect) {
          controller.rotationSelect.value = String(value);
        }
        controller.onTransformChange();
      });
    },
    applyPreset: (name) => {
      whenControllerReady(() => controller.applyImagePreset(name));
    },
    resetImage: () => {
      whenControllerReady(() => controller.resetImageAdjustments());
    },
    saveProfile: () => {
      whenControllerReady(() => controller.saveCurrentProfile());
    },
    deleteProfile: () => {
      whenControllerReady(() => controller.deleteProfile());
    },
    deleteAllProfiles: () => {
      whenControllerReady(() => controller.deleteAllProfiles());
    },
    selectProfile: (name) => {
      whenControllerReady(() => {
        controller.selectedProfile = name;
        if (controller.profileSelect) controller.profileSelect.value = name;
        void controller.loadProfile();
      });
    },
    resetWebcam: () => {
      whenControllerReady(() => void controller.resetWebcamConfiguration());
    },
    openAdjustContext: (context) => {
      whenControllerReady(() => controller.openAdjustmentsForContext(context));
    },
  });
  mountCaptureChrome(document.querySelector('#captureStatusMount'));
  mountMobileHud(document.querySelector('#mobileHudMount'), {
    toggleEffects: () => {
      whenControllerReady(() =>
        controller.setMobileFxPanelVisible(
          !controller.isMobileFxPanelVisible(),
        ),
      );
    },
    closeEffects: () => {
      whenControllerReady(() => controller.setMobileFxPanelVisible(false));
    },
    toggleMirror: () => {
      whenControllerReady(() => controller.toggleMirrorQuick());
    },
    takePhoto: () => {
      whenControllerReady(() => {
        controller.setMobileFxPanelVisible(false);
        controller.requestPhotoCapture();
      });
    },
    toggleRecording: () => {
      whenControllerReady(() => {
        controller.setMobileFxPanelVisible(false);
        controller.toggleRecording();
      });
    },
    toggleDetector: (type, checked) => {
      whenControllerReady(() => {
        const input = controller.getTimelineDetectorCheckbox(type);
        if (input) input.checked = checked;
        controller.handleVideoDetectorToggle(type);
      });
    },
    pickColor: () => {
      whenControllerReady(() => {
        controller.enableColorPick();
        controller.setMobileFxPanelVisible(false);
      });
    },
    setBlobColor: (color) => {
      whenControllerReady(() => controller.setQuickBlobColor(color));
    },
    setFaceColor: (color) => {
      whenControllerReady(() => controller.setQuickFaceColor(color));
    },
    setFaceVisual: (kind, checked) => {
      whenControllerReady(() => controller.setFaceVisualChecked(kind, checked));
    },
    setFaceLabel: (value) => {
      whenControllerReady(() => controller.setQuickFaceLabel(value));
    },
    commitFaceLabel: (value) => {
      whenControllerReady(() => controller.commitQuickFaceLabel(value));
    },
    applyPreset: (name) => {
      whenControllerReady(() => controller.applyImagePreset(name));
    },
    setCaptureTimer: (seconds) => {
      whenControllerReady(() => controller.setCaptureTimerSeconds(seconds));
    },
  });
  mountDetectorChips(document.querySelector('#effectsInfo'));
  mountCaptureModal(document.querySelector('#captureModalTemplateSlot'), {
    download: () => {
      whenControllerReady(() => controller.downloadPendingCapture());
    },
    discard: () => {
      whenControllerReady(() => controller.closeCapturePreview(true));
    },
    setEnhancer: (enabled) => {
      whenControllerReady(() =>
        controller.onPreviewPhotoEnhancerToggle(enabled),
      );
    },
    setEnhancerStrength: (strength) => {
      whenControllerReady(() =>
        controller.onPreviewPhotoEnhancerStrengthInput(strength),
      );
    },
  });
  mountExportModal(document.querySelector('#exportModalTemplateSlot'), {
    cancel: () => {
      whenControllerReady(() => void controller.cancelVideoExport());
    },
    close: () => {
      whenControllerReady(() => controller.closeVideoExportModal());
    },
  });
  await controller.start();
  markControllerReady();
  const refreshLocalizedUi = () => {
    controller.renderEffectConfig?.();
    if (controller.cameraUiState) {
      controller.setCameraState(controller.cameraUiState);
    }
    controller.updateEffectsInfo?.(true);
    controller.publishWebcamPanel?.();
    controller.updateCaptureButtons?.();
    controller.publishCapturePreview?.();
    controller.publishCaptureChrome?.();
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
      <h1>${translate('No se pudo iniciar HateWebcam')}</h1>
      <p>${translate('Revisá que estés sirviendo el proyecto desde localhost/https y que existan los templates.')}</p>
    </main>
  `;
}

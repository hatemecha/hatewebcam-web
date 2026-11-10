/**
 * HateWebcam Web — application entry point.
 */
import { loadAppTemplates } from './app/template-loader.mjs';
import { AppController } from './app/controller.mjs';
import { getLocale, initializeI18n, setLocale, translate } from './i18n.mjs';
import { mountAppHeader } from '../src/lib/shell/mount.ts';
import { updateShellState } from '../src/lib/shell/shell-bridge.mjs';
import { mountDetectorChips } from '../src/lib/preview/mount.ts';
import {
  mountCaptureModal,
  mountExportModal,
} from '../src/lib/modals/mount.ts';
import { mountCameraSource } from '../src/lib/webcam/mount.ts';
import { mountEffectsControls } from '../src/lib/webcam/effects-mount.ts';
import { updateCameraSourceState } from '../src/lib/webcam/camera-source-bridge.mjs';
import { mountPreviewMetrics } from '../src/lib/preview/metrics-mount.ts';
import {
  mountCaptureChrome,
  mountMobileHud,
} from '../src/lib/capture/mount.ts';

const i18n = initializeI18n();
const controller = new AppController();
let controllerReady = false;

try {
  await loadAppTemplates();
  mountAppHeader(
    document.querySelector('#appHeaderMount'),
    {
      setSourceMode: (mode) => {
        if (controllerReady) controller.setSourceMode(mode);
      },
      startVideoExport: () => {
        if (controllerReady) void controller.startVideoExport();
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
      if (controllerReady) void controller.toggleCamera();
    },
    selectCamera: (deviceId) => {
      updateCameraSourceState({ deviceId });
      if (controllerReady) void controller.onCameraChange();
    },
    setPerformanceMode: (mode) => {
      if (controllerReady) {
        void controller.applyPerformanceMode(mode, {
          restartCamera: true,
          notify: true,
        });
      }
    },
    toggleMirror: () => {
      if (controllerReady) controller.toggleMirrorQuick();
    },
  });
  mountPreviewMetrics(document.querySelector('#previewMetricsMount'));
  mountEffectsControls(document.querySelector('#effectsControlsSlot'), {
    toggleDetector: (type, checked) => {
      const input = controller.getTimelineDetectorCheckbox(type);
      if (input) input.checked = checked;
      if (controllerReady) controller.handleVideoDetectorToggle(type);
    },
    setBlobColor: (color) => {
      if (controllerReady) controller.setQuickBlobColor(color);
    },
    setFaceColor: (color) => {
      if (controllerReady) controller.setQuickFaceColor(color);
    },
    setFaceLabel: (value) => {
      if (controllerReady) controller.setQuickFaceLabel(value);
    },
    commitFaceLabel: (value) => {
      if (controllerReady) controller.commitQuickFaceLabel(value);
    },
    setFaceVisual: (kind, checked) => {
      if (controllerReady) controller.setFaceVisualChecked(kind, checked);
    },
    pickColor: () => {
      if (controllerReady) controller.enableColorPick();
    },
    toggleAdvanced: () => {
      if (controllerReady) controller.toggleAdvancedOptions();
    },
    setImageNumber: (key, value) => {
      if (controllerReady) controller.setPanelImageNumber(key, value);
    },
    setBlackAndWhite: (checked) => {
      if (controllerReady) controller.setPanelBlackAndWhite(checked);
    },
    setVideoFormat: (format) => {
      if (controllerReady) controller.setPanelVideoFormat(format);
    },
    setQualityEnhancer: (checked) => {
      if (controllerReady) controller.setPanelQualityEnhancer(checked);
    },
    setShutterSound: (checked) => {
      if (controllerReady) controller.setPanelShutterSound(checked);
    },
    setFlipH: (checked) => {
      if (!controllerReady) return;
      controller.flipH = checked;
      if (controller.chkMirror) controller.chkMirror.checked = checked;
      controller.onTransformChange();
    },
    setFlipV: (checked) => {
      if (!controllerReady) return;
      controller.flipV = checked;
      if (controller.chkFlipV) controller.chkFlipV.checked = checked;
      controller.onTransformChange();
    },
    setRotation: (value) => {
      if (!controllerReady) return;
      controller.rotation = value;
      if (controller.rotationSelect) {
        controller.rotationSelect.value = String(value);
      }
      controller.onTransformChange();
    },
    applyPreset: (name) => {
      if (controllerReady) controller.applyImagePreset(name);
    },
    resetImage: () => {
      if (controllerReady) controller.resetImageAdjustments();
    },
    saveProfile: () => {
      if (controllerReady) controller.saveCurrentProfile();
    },
    deleteProfile: () => {
      if (controllerReady) controller.deleteProfile();
    },
    deleteAllProfiles: () => {
      if (controllerReady) controller.deleteAllProfiles();
    },
    selectProfile: (name) => {
      if (!controllerReady) return;
      controller.selectedProfile = name;
      if (controller.profileSelect) controller.profileSelect.value = name;
      void controller.loadProfile();
    },
    resetWebcam: () => {
      if (controllerReady) void controller.resetWebcamConfiguration();
    },
    openAdjustContext: (context) => {
      if (controllerReady) controller.openAdjustmentsForContext(context);
    },
  });
  mountCaptureChrome(document.querySelector('#captureStatusMount'));
  mountMobileHud(document.querySelector('#mobileHudMount'), {
    toggleEffects: () => {
      if (!controllerReady) return;
      controller.setMobileFxPanelVisible(!controller.isMobileFxPanelVisible());
    },
    closeEffects: () => {
      if (controllerReady) controller.setMobileFxPanelVisible(false);
    },
    toggleMirror: () => {
      if (controllerReady) controller.toggleMirrorQuick();
    },
    takePhoto: () => {
      if (!controllerReady) return;
      controller.setMobileFxPanelVisible(false);
      controller.requestPhotoCapture();
    },
    toggleRecording: () => {
      if (!controllerReady) return;
      controller.setMobileFxPanelVisible(false);
      controller.toggleRecording();
    },
    toggleDetector: (type, checked) => {
      const input = controller.getTimelineDetectorCheckbox(type);
      if (input) input.checked = checked;
      if (controllerReady) controller.handleVideoDetectorToggle(type);
    },
    pickColor: () => {
      if (!controllerReady) return;
      controller.enableColorPick();
      controller.setMobileFxPanelVisible(false);
    },
    setBlobColor: (color) => {
      if (controllerReady) controller.setQuickBlobColor(color);
    },
    setFaceColor: (color) => {
      if (controllerReady) controller.setQuickFaceColor(color);
    },
    setFaceVisual: (kind, checked) => {
      if (controllerReady) controller.setFaceVisualChecked(kind, checked);
    },
    setFaceLabel: (value) => {
      if (controllerReady) controller.setQuickFaceLabel(value);
    },
    commitFaceLabel: (value) => {
      if (controllerReady) controller.commitQuickFaceLabel(value);
    },
    applyPreset: (name) => {
      if (controllerReady) controller.applyImagePreset(name);
    },
    setCaptureTimer: (seconds) => {
      if (controllerReady) controller.setCaptureTimerSeconds(seconds);
    },
  });
  mountDetectorChips(document.querySelector('#effectsInfo'));
  mountCaptureModal(document.querySelector('#captureModalTemplateSlot'), {
    download: () => {
      if (controllerReady) controller.downloadPendingCapture();
    },
    discard: () => {
      if (controllerReady) controller.closeCapturePreview(true);
    },
    setEnhancer: (enabled) => {
      if (controllerReady) controller.onPreviewPhotoEnhancerToggle(enabled);
    },
    setEnhancerStrength: (strength) => {
      if (controllerReady)
        controller.onPreviewPhotoEnhancerStrengthInput(strength);
    },
  });
  mountExportModal(document.querySelector('#exportModalTemplateSlot'), {
    cancel: () => {
      if (controllerReady) void controller.cancelVideoExport();
    },
    close: () => {
      if (controllerReady) controller.closeVideoExportModal();
    },
  });
  i18n.translateDocument();
  await controller.start();
  controllerReady = true;
} catch (err) {
  console.error(err);
  document.body.innerHTML = `
    <main class="boot-error" style="max-width: 42rem; margin: 12vh auto; padding: 2rem; font-family: system-ui, sans-serif; line-height: 1.5;">
      <h1>${translate('No se pudo iniciar HateWebcam')}</h1>
      <p>${translate('Revisá que estés sirviendo el proyecto desde localhost/https y que existan los templates.')}</p>
    </main>
  `;
  i18n.translateDocument();
}

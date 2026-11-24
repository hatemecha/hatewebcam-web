import type { ImageSettings } from './constants.ts';
import { oneOf } from './webcam-settings.ts';

const presets = {
  fast: {
    editorExportMode: 'full',
    experimentalExportFeatures: false,
    editorExportFormat: 'webm',
    editorCopyAudio: false,
    qualityEnhancer: false,
    qualityEnhancerStrength: 20,
  },
  balanced: {
    editorExportMode: 'full',
    experimentalExportFeatures: false,
    editorExportFormat: 'webm',
    editorCopyAudio: false,
    qualityEnhancer: false,
    qualityEnhancerStrength: 35,
  },
  high: {
    editorExportMode: 'full',
    experimentalExportFeatures: false,
    editorExportFormat: 'webm',
    editorCopyAudio: false,
    qualityEnhancer: true,
    qualityEnhancerStrength: 55,
  },
  chroma: {
    editorExportMode: 'effects-chroma',
    experimentalExportFeatures: false,
    editorExportFormat: 'webm',
    editorCopyAudio: false,
    effectsExportChroma: 'green',
    qualityEnhancer: false,
    qualityEnhancerStrength: 35,
  },
  'experimental-mp4': {
    editorExportMode: 'full',
    experimentalExportFeatures: true,
    editorExportFormat: 'mp4',
    editorCopyAudio: true,
    qualityEnhancer: false,
    qualityEnhancerStrength: 35,
  },
} satisfies Record<ImageSettings['editorExportPreset'], Partial<ImageSettings>>;

export function applyEditorExportPreset(
  settings: ImageSettings,
  preset: string,
): void {
  const name = oneOf(
    preset,
    ['fast', 'balanced', 'high', 'chroma', 'experimental-mp4'],
    'balanced',
  );
  Object.assign(settings, presets[name], { editorExportPreset: name });
}

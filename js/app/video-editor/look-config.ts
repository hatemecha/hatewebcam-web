import { DEFAULT_IMAGE_SETTINGS, type ImageSettings } from '../constants.ts';

const automationModes = [
  'fixed',
  'beat-pulse',
  'fade-in',
  'fade-out',
  'alternate-beat',
] as const;
type AutomationMode = (typeof automationModes)[number];

export const lookControls = [
  'exposure',
  'shadows',
  'highlights',
  'contrast',
  'saturation',
  'temperature',
  'detail',
  'sharpness',
] as const;
export type LookConfig = Pick<
  ImageSettings,
  (typeof lookControls)[number] | 'blackAndWhite'
> & { automation: AutomationMode };

export function normalizeClipAutomation(value: unknown): AutomationMode {
  return automationModes.find((mode) => mode === value) ?? 'fixed';
}

export function normalizeLookClipConfig(
  config: Record<string, unknown> = {},
): LookConfig {
  const defaults = DEFAULT_IMAGE_SETTINGS;
  const number = (
    key: (typeof lookControls)[number],
    min: number,
    max: number,
  ) => {
    const value = Number.parseInt(String(config[key] ?? defaults[key]), 10);
    const valid = Number.isFinite(value) && (key !== 'contrast' || value !== 0);
    return Math.min(max, Math.max(min, valid ? value : defaults[key]));
  };
  return {
    blackAndWhite: Boolean(config.blackAndWhite),
    exposure: number('exposure', -100, 100),
    shadows: number('shadows', -100, 100),
    highlights: number('highlights', -100, 100),
    contrast: number('contrast', 50, 180),
    saturation: number('saturation', 0, 200),
    temperature: number('temperature', -100, 100),
    detail: number('detail', -100, 100),
    sharpness: number('sharpness', 0, 100),
    automation: normalizeClipAutomation(config.automation),
  };
}

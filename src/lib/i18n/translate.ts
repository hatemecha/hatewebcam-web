import { englishMessages, type MessageKey } from './catalog';
import { getLocale, type Locale } from './locale-state';

export type MessageValues = Record<string, string | number>;

// Source files and catalog keys can differ in Unicode normalization (NFC vs
// NFD) depending on the editor or tool that wrote them. Normalize both sides
// so accented Spanish keys always resolve.
const normalizedMessages = new Map(
  Object.entries(englishMessages).map(([key, value]) => [
    key.normalize('NFC'),
    value,
  ]),
);

export function isMessageKey(value: string): value is MessageKey {
  return normalizedMessages.has(value.normalize('NFC'));
}

function fill(template: string, values?: MessageValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : token,
  );
}

export function translate(
  locale: Locale,
  key: string,
  values?: MessageValues,
): string {
  const template =
    locale === 'en'
      ? (normalizedMessages.get(key.normalize('NFC')) ?? key)
      : key;
  return fill(template, values);
}

export function translateCurrent(key: string, values?: MessageValues): string {
  return translate(getLocale(), key, values);
}

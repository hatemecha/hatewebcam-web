import { englishMessages, type MessageKey } from './catalog';
import { getLocale, type Locale } from './locale-state';

export type MessageValues = Record<string, string | number>;

export function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(englishMessages, value);
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
    locale === 'en' && isMessageKey(key) ? englishMessages[key] : key;
  return fill(template, values);
}

export function translateCurrent(key: string, values?: MessageValues): string {
  return translate(getLocale(), key, values);
}

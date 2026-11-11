import {
  getLocale,
  initializeI18n,
  setLocale,
} from '../src/lib/i18n/locale-state.ts';
import { translate as translateMessage } from '../src/lib/i18n/translate.ts';

export { getLocale, initializeI18n, setLocale };

export function translate(value, locale = getLocale(), values) {
  return translateMessage(locale || getLocale(), value, values);
}

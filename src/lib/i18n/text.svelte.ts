import type { MessageKey } from './catalog';
import { getLocale, subscribeLocale } from './locale-state';
import { translate, type MessageValues } from './translate';

let current = $state(getLocale());

subscribeLocale((locale) => {
  current = locale;
});

export function m(key: MessageKey, values?: MessageValues): string {
  return translate(current, key, values);
}

import { getLocale } from './locale-state';
import { isMessageKey, translate } from './translate';

const TEXT_SOURCE = new WeakMap<Text, string>();
const ATTRIBUTE_SOURCE = new WeakMap<Element, Map<string, string>>();
const ATTRIBUTES = ['aria-label', 'title', 'placeholder'];

function compact(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function writeText(node: Text, source: string): void {
  const current = node.nodeValue ?? '';
  const leading = current.match(/^\s*/)?.[0] ?? '';
  const trailing = current.match(/\s*$/)?.[0] ?? '';
  const localized = translate(getLocale(), source);
  const next = `${leading}${localized}${trailing}`;
  if (current !== next) node.nodeValue = next;
}

export function applyMessages(
  root: ParentNode,
  options?: { refresh?: boolean; includeOwned?: boolean },
): void {
  if (typeof document === 'undefined') return;
  const refresh = options?.refresh === true;
  const includeOwned = options?.includeOwned === true;
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let node = walker.nextNode();
  while (node) {
    if (!includeOwned) {
      const element =
        node instanceof Element ? node : (node.parentElement ?? null);
      if (element?.closest('[data-i18n-owner]')) {
        node = walker.nextNode();
        continue;
      }
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const parent = text.parentElement;
      if (parent?.closest('script, style')) {
        node = walker.nextNode();
        continue;
      }
      let source = TEXT_SOURCE.get(text);
      if (!source && !refresh) {
        const candidate = compact(text.nodeValue ?? '');
        if (isMessageKey(candidate)) {
          source = candidate;
          TEXT_SOURCE.set(text, source);
        }
      }
      if (source) writeText(text, source);
    } else if (node instanceof Element && !node.matches('script, style')) {
      let sources = ATTRIBUTE_SOURCE.get(node);
      for (const name of ATTRIBUTES) {
        if (!node.hasAttribute(name)) continue;
        const current = node.getAttribute(name) ?? '';
        let source = sources?.get(name);
        if (!source && !refresh && isMessageKey(current)) {
          source = current;
          if (!sources) {
            sources = new Map();
            ATTRIBUTE_SOURCE.set(node, sources);
          }
          sources.set(name, source);
        }
        if (!source) continue;
        const localized = translate(getLocale(), source);
        if (current !== localized) node.setAttribute(name, localized);
      }
    }
    node = walker.nextNode();
  }
}

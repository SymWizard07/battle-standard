/** True when the event target is a text field that should own typing keys. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

/** True when focus is inside a panel that isolates keyboard shortcuts (e.g. Imports). */
export function isIsolatedPanelKeyTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  return Boolean(el.closest('[data-imports-panel]'));
}

/** Skip map / app hotkeys when typing or when an isolated panel has focus. */
export function shouldIgnoreGlobalHotkey(target: EventTarget | null): boolean {
  return isTypingTarget(target) || isIsolatedPanelKeyTarget(target);
}

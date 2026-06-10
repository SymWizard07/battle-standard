import { useEffect } from 'react';

export const APP_TITLE = 'Battle Standard';

/** Build a tab title from parts, deduped, with the app name suffix. */
export function formatDocumentTitle(...parts: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const segments: string[] = [];
  for (const part of parts) {
    const trimmed = part?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    segments.push(trimmed);
  }
  return segments.length > 0 ? `${segments.join(' · ')} · ${APP_TITLE}` : APP_TITLE;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

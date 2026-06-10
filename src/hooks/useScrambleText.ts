import { useEffect, useState } from 'react';

const SCRAMBLE_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*<>[]{}';

export function scrambleText(text: string): string {
  return Array.from(text)
    .map((char) => {
      if (char === ' ') return ' ';
      return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]!;
    })
    .join('');
}

export function useScrambleText(text: string, active: boolean, intervalMs = 55): string {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (!active) {
      setDisplay(text);
      return;
    }
    setDisplay(scrambleText(text));
    const id = window.setInterval(() => setDisplay(scrambleText(text)), intervalMs);
    return () => window.clearInterval(id);
  }, [text, active, intervalMs]);

  return active ? display : text;
}

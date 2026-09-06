import { useEffect, useRef, useState } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import { renderDrawTextShape } from './layers/DrawLayer';
import {
  DEFAULT_DRAW_TEXT_FONT,
  drawTextBounds,
  drawTextFontSize,
  drawTextKonvaFontStyle,
  drawTextMarqueeSize,
  drawTextTopLeft,
  measureDrawTextWidth,
} from '../lib/drawText';
import { resolveDrawColor } from '../lib/drawShapes';
import { newId } from '../lib/ids';
import type { DrawTextParams, EphemeralDrawText, Point } from '../lib/types';
import { useStore } from '../store/useStore';

export const DRAW_TEXT_INPUT_ATTR = 'data-draw-text-input';

interface PlaceholderProps {
  world: Point | null;
  color: string;
  fontSize: number;
  fontFamily: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  visible: boolean;
}

/** Cursor-following "text" hint — local only. */
export function DrawTextCursorPlaceholder({
  world,
  color,
  fontSize,
  fontFamily,
  bold,
  italic,
  underline,
  visible,
}: PlaceholderProps) {
  if (!visible || !world) return null;
  return (
    <Text
      x={world.x}
      y={world.y - fontSize}
      text="text"
      fontSize={fontSize}
      fontFamily={fontFamily}
      fontStyle={drawTextKonvaFontStyle({ bold, italic })}
      textDecoration={underline ? 'underline' : undefined}
      fill={resolveDrawColor(color)}
      opacity={0.55}
      listening={false}
    />
  );
}

interface SelectionRange {
  start: number;
  end: number;
}

interface EditOverlayProps {
  ephemeral: EphemeralDrawText;
  caretVisible: boolean;
  selection: SelectionRange;
}

/** Local marquee + caret/selection + live text while editing. */
export function DrawTextEditOverlay({
  ephemeral,
  caretVisible,
  selection,
}: EditOverlayProps) {
  const { params, strokeWidth: fontSize, color } = ephemeral;
  const strokeColor = resolveDrawColor(color);
  const { width, height } = drawTextMarqueeSize(
    params.text,
    fontSize,
    params.fontFamily,
    params,
  );
  const bounds = drawTextBounds(params, fontSize);
  const topLeft = drawTextTopLeft(params, fontSize);
  const selStart = Math.min(selection.start, selection.end);
  const selEnd = Math.max(selection.start, selection.end);
  const preWidth = measureDrawTextWidth(
    params.text.slice(0, selStart),
    fontSize,
    params.fontFamily,
    params,
  );
  const selWidth = measureDrawTextWidth(
    params.text.slice(0, selEnd),
    fontSize,
    params.fontFamily,
    params,
  );
  const caretX = topLeft.x + selWidth;
  const caretTop = topLeft.y;
  const caretBottom = topLeft.y + fontSize * 1.15;
  const hasSelection = selEnd > selStart;

  return (
    <Group listening={false}>
      <Rect
        x={bounds.minX}
        y={bounds.minY}
        width={width}
        height={height}
        stroke="#38bdf8"
        strokeWidth={Math.max(1, fontSize * 0.06)}
        dash={[Math.max(4, fontSize * 0.25), Math.max(3, fontSize * 0.15)]}
        fill="rgba(56, 189, 248, 0.06)"
        listening={false}
      />
      {hasSelection && (
        <Rect
          x={topLeft.x + preWidth}
          y={caretTop}
          width={Math.max(1, selWidth - preWidth)}
          height={fontSize * 1.15}
          fill="rgba(56, 189, 248, 0.35)"
          listening={false}
        />
      )}
      {renderDrawTextShape(params, strokeColor, fontSize, 1, 'edit-text')}
      {!hasSelection && caretVisible && (
        <Line
          points={[caretX, caretTop, caretX, caretBottom]}
          stroke={strokeColor}
          strokeWidth={Math.max(1, fontSize * 0.08)}
          listening={false}
        />
      )}
    </Group>
  );
}

export function useDrawTextCaretBlink(active: boolean): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!active) {
      setVisible(true);
      return;
    }
    const id = window.setInterval(() => setVisible((v) => !v), 530);
    return () => window.clearInterval(id);
  }, [active]);
  return visible;
}

/**
 * Hidden focused textarea so typing/selection/clipboard stay in the field
 * and other global hotkeys treat the map as a typing target.
 */
export function DrawTextInputHost({
  ephemeral,
  activeSceneId,
  onSelectionChange,
}: {
  ephemeral: EphemeralDrawText;
  activeSceneId: string;
  onSelectionChange: (sel: SelectionRange) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const setEphemeralDrawText = useStore((s) => s.setEphemeralDrawText);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const len = ephemeral.params.text.length;
    el.setSelectionRange(len, len);
    onSelectionChange({ start: len, end: len });
    // Only remount-focus when a new edit session starts (origin identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional session start
  }, [ephemeral.params.origin.x, ephemeral.params.origin.y]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const syncSelection = () => {
      onSelectionChange({ start: el.selectionStart, end: el.selectionEnd });
    };

    const keepFocus = () => {
      if (!useStore.getState().ephemeralDrawText) return;
      // Reclaim focus so global hotkeys keep treating this as a typing field.
      el.focus({ preventScroll: true });
    };

    const blockOutsideShortcuts = (e: KeyboardEvent) => {
      if (!useStore.getState().ephemeralDrawText) return;
      if (document.activeElement === el || e.target === el) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName?.toLowerCase() === 'input' || target?.isContentEditable) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      el.focus({ preventScroll: true });
    };

    el.addEventListener('select', syncSelection);
    el.addEventListener('keyup', syncSelection);
    el.addEventListener('click', syncSelection);
    el.addEventListener('blur', keepFocus);
    window.addEventListener('keydown', blockOutsideShortcuts, {
      capture: true,
      passive: false,
    });
    return () => {
      el.removeEventListener('select', syncSelection);
      el.removeEventListener('keyup', syncSelection);
      el.removeEventListener('click', syncSelection);
      el.removeEventListener('blur', keepFocus);
      window.removeEventListener('keydown', blockOutsideShortcuts, { capture: true });
    };
  }, [onSelectionChange]);

  const dataAttrProps = { [DRAW_TEXT_INPUT_ATTR]: '' } as Record<string, string>;

  return (
    <textarea
      {...dataAttrProps}
      ref={ref}
      value={ephemeral.params.text}
      aria-label="Draw text"
      rows={1}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      onChange={(e) => {
        const nextText = e.target.value.replace(/\r?\n/g, '');
        const el = e.target;
        setEphemeralDrawText({
          ...useStore.getState().ephemeralDrawText!,
          params: {
            ...useStore.getState().ephemeralDrawText!.params,
            text: nextText,
          },
        });
        // Keep caret after React re-render from controlled value.
        requestAnimationFrame(() => {
          if (ref.current) {
            ref.current.setSelectionRange(el.selectionStart, el.selectionEnd);
            onSelectionChange({
              start: ref.current.selectionStart,
              end: ref.current.selectionEnd,
            });
          }
        });
      }}
      onKeyDown={(e) => {
        const current = useStore.getState().ephemeralDrawText;
        if (!current) return;
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          useStore.getState().cycleDrawTextFont();
          return;
        }
        if (handleDrawTextStyleShortcut(e)) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          commitOrDiscardEphemeralDrawText(activeSceneId, current);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setEphemeralDrawText(null);
        }
      }}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        opacity: 0,
        border: 0,
        padding: 0,
        margin: 0,
        resize: 'none',
        overflow: 'hidden',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  );
}

export function handleDrawTextStyleShortcut(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'> & {
    preventDefault: () => void;
    stopPropagation: () => void;
  },
): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  const key = e.key.toLowerCase();
  const store = useStore.getState();
  if (key === 'b') {
    e.preventDefault();
    e.stopPropagation();
    store.toggleDrawTextBold();
    return true;
  }
  if (key === 'i') {
    e.preventDefault();
    e.stopPropagation();
    store.toggleDrawTextItalic();
    return true;
  }
  if (key === 'u') {
    e.preventDefault();
    e.stopPropagation();
    store.toggleDrawTextUnderline();
    return true;
  }
  return false;
}

export function beginEphemeralDrawText(
  origin: Point,
  color: string,
  outlineWidth: number,
  style: Pick<DrawTextParams, 'fontFamily' | 'bold' | 'italic' | 'underline'> = {
    fontFamily: DEFAULT_DRAW_TEXT_FONT,
  },
): EphemeralDrawText {
  return {
    color,
    strokeWidth: drawTextFontSize(outlineWidth),
    params: {
      origin: { ...origin },
      text: '',
      fontFamily: style.fontFamily,
      bold: !!style.bold,
      italic: !!style.italic,
      underline: !!style.underline,
    },
  };
}

export function commitOrDiscardEphemeralDrawText(
  sceneId: string,
  ephemeral: EphemeralDrawText | null,
): void {
  const store = useStore.getState();
  if (!ephemeral) {
    store.setEphemeralDrawText(null);
    return;
  }
  const text = ephemeral.params.text;
  // Keep the last used appearance for the next placement.
  useStore.setState({
    drawTextFont: ephemeral.params.fontFamily,
    drawTextBold: !!ephemeral.params.bold,
    drawTextItalic: !!ephemeral.params.italic,
    drawTextUnderline: !!ephemeral.params.underline,
  });
  if (text.length > 0) {
    store.addDrawStroke(sceneId, {
      id: newId(),
      kind: 'text',
      color: ephemeral.color,
      strokeWidth: ephemeral.strokeWidth,
      params: {
        origin: { ...ephemeral.params.origin },
        text,
        fontFamily: ephemeral.params.fontFamily,
        bold: !!ephemeral.params.bold,
        italic: !!ephemeral.params.italic,
        underline: !!ephemeral.params.underline,
      },
    });
  }
  store.setEphemeralDrawText(null);
}

import { useEffect, useLayoutEffect, useRef } from 'react';
import { isStatExpressionHighlight, STAT_EXPRESSION_TOKEN, tryEvaluateExpressionAt } from '../lib/statExpression';
import {
  cssFontStyle,
  cssFontWeight,
  markupGroupsAtOffset,
  parseTokenNameMarkupPieces,
  type TokenNameMarkupPiece,
  type TokenNameStyle,
} from '../lib/tokenNameMarkup';
import { SHEET_HEADING_COLOR } from '../lib/tokenSheetTextMarkup';

const BODY_CLASS = 'sheet-text-line text-xs leading-snug text-slate-100';
const HEADING_CLASS =
  'sheet-text-line w-full border-b pb-0.5 text-base font-semibold leading-snug';

const DELIM_VISIBLE =
  'markup-delim inline text-[0.85em] font-normal not-italic text-slate-500 no-underline';
const DELIM_HIDDEN =
  'markup-delim inline overflow-hidden border-0 p-0 text-[0px] leading-none text-transparent';

function isHeadingLine(text: string): boolean {
  return /^#\s/.test(text);
}

function blockText(block: HTMLElement): string {
  // Contenteditable often inserts NBSP for typed spaces; keep them as real spaces.
  return (block.textContent ?? '').replace(/\u00a0/g, ' ');
}

function lineBlocks(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(':scope > div.sheet-text-line, :scope > div')];
}

function readEditableValue(root: HTMLElement): string {
  const blocks = lineBlocks(root);
  if (blocks.length === 0) return (root.textContent ?? '').replace(/\u00a0/g, ' ');
  return blocks.map((b) => blockText(b)).join('\n');
}

function applyLineChrome(block: HTMLElement, heading: boolean) {
  if (heading) {
    block.className = HEADING_CLASS;
    block.style.borderColor = 'rgba(251, 191, 36, 0.55)';
  } else {
    block.className = BODY_CLASS;
    block.style.borderColor = '';
    block.style.color = '';
  }
}

function appendDelim(parent: HTMLElement, text: string, visible: boolean) {
  const span = document.createElement('span');
  span.dataset.markupDelim = '1';
  span.className = visible ? DELIM_VISIBLE : DELIM_HIDDEN;
  span.textContent = text;
  parent.appendChild(span);
}

function appendStyledText(
  parent: HTMLElement,
  text: string,
  style: TokenNameStyle,
  heading: boolean,
) {
  if (!text) return;

  const applyStyle = (el: HTMLElement, overrideColor?: string) => {
    el.style.color = overrideColor ?? (heading ? SHEET_HEADING_COLOR : style.color);
    const weight = cssFontWeight(style.bold || heading);
    el.style.fontWeight = weight != null ? String(weight) : '';
    el.style.fontStyle = cssFontStyle(style.italic) ?? '';
    el.style.textDecoration = [
      style.underline ? 'underline' : '',
      style.strikethrough ? 'line-through' : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (style.obfuscated) el.classList.add('font-mono');
  };

  const re = new RegExp(STAT_EXPRESSION_TOKEN.source, 'gi');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) != null) {
    const [token] = match;
    if (!isStatExpressionHighlight(token)) continue;
    if (match.index > last) {
      const span = document.createElement('span');
      applyStyle(span);
      span.textContent = text.slice(last, match.index);
      parent.appendChild(span);
    }
    const span = document.createElement('span');
    applyStyle(span, '#38bdf8');
    span.textContent = token;
    parent.appendChild(span);
    last = match.index + token.length;
  }
  if (last < text.length) {
    const span = document.createElement('span');
    applyStyle(span);
    span.textContent = text.slice(last);
    parent.appendChild(span);
  }
}

function decorateLine(block: HTMLElement, lineText: string, caretInLine: number | null) {
  const heading = isHeadingLine(lineText);
  applyLineChrome(block, heading);

  if (lineText === '') {
    block.replaceChildren();
    block.appendChild(document.createElement('br'));
    return;
  }

  const headingMatch = /^#(\s+)/.exec(lineText);
  const prefix = headingMatch?.[0] ?? '';
  const body = prefix ? lineText.slice(prefix.length) : lineText;
  const caretInBody =
    caretInLine == null ? null : Math.max(0, caretInLine - prefix.length);
  const lineActive = caretInLine != null;

  const pieces: TokenNameMarkupPiece[] = parseTokenNameMarkupPieces(body);
  const activeGroups =
    caretInBody == null ? new Set<number>() : markupGroupsAtOffset(pieces, caretInBody);

  block.replaceChildren();

  if (prefix) {
    appendDelim(block, prefix, lineActive);
  }

  if (pieces.length === 0 && body === '') {
    // heading with only prefix
  } else if (pieces.map((p) => p.text).join('') !== body) {
    // Safety: if parser doesn't cover source, fall back to plain text.
    block.textContent = lineText;
    applyLineChrome(block, heading);
    return;
  } else {
    for (const piece of pieces) {
      if (piece.kind === 'delim') {
        const visible = piece.groups.some((g) => activeGroups.has(g));
        appendDelim(block, piece.text, visible);
      } else {
        appendStyledText(block, piece.text, piece.style, heading);
      }
    }
  }

  // Round-trip guard
  if (blockText(block) !== lineText) {
    block.textContent = lineText;
    applyLineChrome(block, heading);
  }
}

function decorateRoot(root: HTMLElement, caretAbsolute: number | null) {
  let lineStart = 0;
  const blocks = lineBlocks(root);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const text = blockText(block);
    const caretInLine =
      caretAbsolute != null &&
      caretAbsolute >= lineStart &&
      caretAbsolute <= lineStart + text.length
        ? caretAbsolute - lineStart
        : null;
    decorateLine(block, text, caretInLine);
    lineStart += text.length + (i < blocks.length - 1 ? 1 : 0);
  }
}

function createLine(text: string, caretInLine: number | null = null): HTMLDivElement {
  const div = document.createElement('div');
  decorateLine(div, text, caretInLine);
  return div;
}

function writeEditableValue(root: HTMLElement, value: string, caretAbsolute: number | null = null) {
  root.replaceChildren();
  const lines = value.split('\n');
  let lineStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const caretInLine =
      caretAbsolute != null &&
      caretAbsolute >= lineStart &&
      caretAbsolute <= lineStart + line.length
        ? caretAbsolute - lineStart
        : null;
    root.appendChild(createLine(line, caretInLine));
    lineStart += line.length + 1;
  }
  if (root.childNodes.length === 0) root.appendChild(createLine('', 0));
}

function ensureBlockStructure(root: HTMLElement) {
  const children = [...root.childNodes];
  const hasDiv = children.some(
    (n) => n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'DIV',
  );

  if (!hasDiv) {
    const text = (root.textContent ?? '').replace(/\u00a0/g, ' ');
    writeEditableValue(root, text, null);
    return;
  }

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? '';
      if (!text) {
        child.parentNode?.removeChild(child);
        continue;
      }
      root.replaceChild(createLine(text, null), child);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as HTMLElement;
    if (el.tagName === 'BR') {
      root.replaceChild(createLine('', null), el);
      continue;
    }
    if (el.tagName === 'DIV') {
      if (blockText(el) === '' && !el.querySelector('br')) {
        el.replaceChildren();
        el.appendChild(document.createElement('br'));
      }
      continue;
    }
    root.replaceChild(createLine(el.textContent ?? '', null), el);
  }

  if (lineBlocks(root).length === 0) root.appendChild(createLine('', null));
}

function caretTextOffset(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const node = sel.focusNode ?? sel.anchorNode;
  if (!node) return 0;
  const offset = sel.focusNode ? sel.focusOffset : sel.anchorOffset;
  return pointTextOffset(root, node, offset);
}

function pointTextOffset(root: HTMLElement, container: Node, offset: number): number {
  const blocks = lineBlocks(root);
  if (blocks.length === 0) {
    const range = document.createRange();
    range.selectNodeContents(root);
    try {
      range.setEnd(container, offset);
    } catch {
      return 0;
    }
    return range.toString().length;
  }

  let absolute = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block === container || block.contains(container)) {
      const pre = document.createRange();
      pre.selectNodeContents(block);
      try {
        pre.setEnd(container, offset);
      } catch {
        return absolute;
      }
      return absolute + pre.toString().length;
    }
    absolute += blockText(block).length;
    if (i < blocks.length - 1) absolute += 1;
  }
  return absolute;
}

function selectionIsCollapsedIn(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  if (!sel.anchorNode || !root.contains(sel.anchorNode)) return true;
  return sel.isCollapsed;
}

function setCaretTextOffset(root: HTMLElement, absolute: number) {
  const sel = window.getSelection();
  if (!sel) return;

  const blocks = lineBlocks(root);
  if (blocks.length === 0) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }

  let remaining = Math.max(0, absolute);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const len = blockText(block).length;

    if (remaining <= len) {
      setCaretInBlock(block, remaining);
      return;
    }
    remaining -= len;
    if (i < blocks.length - 1) {
      if (remaining === 0) {
        setCaretInBlock(blocks[i + 1]!, 0);
        return;
      }
      remaining -= 1;
    }
  }

  const last = blocks[blocks.length - 1]!;
  setCaretInBlock(last, blockText(last).length);
}

function setCaretInBlock(block: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;

  if (blockText(block).length === 0) {
    const range = document.createRange();
    range.setStart(block, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }

  let remaining = offset;
  const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let node = walk.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walk.nextNode();
  }

  const range = document.createRange();
  range.selectNodeContents(block);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function splitBlockAtCaret(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  const blocks = lineBlocks(root);
  const block = blocks.find((b) => b === range.startContainer || b.contains(range.startContainer));
  if (!block) return false;

  const pre = range.cloneRange();
  pre.selectNodeContents(block);
  pre.setEnd(range.startContainer, range.startOffset);
  const before = pre.toString();
  const full = blockText(block);
  const after = full.slice(before.length);

  decorateLine(block, before, null);
  const next = createLine(after, 0);
  block.after(next);
  setCaretInBlock(next, 0);
  return true;
}

export function TokenSheetTextEditor({
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel = 'Traits, actions, reactions, and effects',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastValueRef = useRef(value);
  const decoratingRef = useRef(false);

  const syncDecorationRef = useRef<(caret: number | null) => void>(() => {});

  const syncDecoration = (caret: number | null) => {
    const root = rootRef.current;
    if (!root || decoratingRef.current) return;
    decoratingRef.current = true;
    try {
      decorateRoot(root, caret);
      if (caret != null) setCaretTextOffset(root, caret);
    } finally {
      decoratingRef.current = false;
    }
  };
  syncDecorationRef.current = syncDecoration;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (root.childNodes.length === 0) {
      writeEditableValue(root, value, null);
      lastValueRef.current = value;
      return;
    }

    if (value === lastValueRef.current) return;

    const focused = document.activeElement === root;
    const offset = focused ? caretTextOffset(root) : null;
    writeEditableValue(root, value, offset);
    lastValueRef.current = value;
    if (focused && offset != null) setCaretTextOffset(root, Math.min(offset, value.length));
  }, [value]);

  useEffect(() => {
    const onSel = () => {
      const root = rootRef.current;
      if (!root || document.activeElement !== root || decoratingRef.current) return;
      // Redrawing markup destroys Dom ranges — skip while the user is
      // highlighting (mouse drag, Shift+arrows, Ctrl+A, etc.).
      if (!selectionIsCollapsedIn(root)) return;
      syncDecorationRef.current(caretTextOffset(root));
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const commitFromDom = () => {
    const root = rootRef.current;
    if (!root || decoratingRef.current) return;
    if (lineBlocks(root).length === 0) ensureBlockStructure(root);
    // Don't restyle mid-highlight or the selection is cleared.
    if (!selectionIsCollapsedIn(root)) {
      const next = readEditableValue(root);
      lastValueRef.current = next;
      if (next !== value) onChange(next);
      return;
    }
    const caret = caretTextOffset(root);
    const next = readEditableValue(root);
    syncDecoration(caret);
    lastValueRef.current = next;
    if (next !== value) onChange(next);
  };

  return (
    <div
      ref={rootRef}
      role="textbox"
      aria-multiline
      aria-label={ariaLabel}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className={`min-h-0 w-full flex-1 overflow-auto whitespace-pre-wrap break-words outline-none ${className}`}
      onInput={() => commitFromDom()}
      onBlur={() => {
        const root = rootRef.current;
        if (!root) return;
        const next = readEditableValue(root);
        // Hide all delims when leaving the field.
        syncDecoration(null);
        lastValueRef.current = next;
        if (next !== value) onChange(next);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        const root = rootRef.current;
        if (!root) return;
        if (!splitBlockAtCaret(root)) return;
        const next = readEditableValue(root);
        lastValueRef.current = next;
        onChange(next);
        syncDecoration(caretTextOffset(root));
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData
          .getData('text/plain')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');
        document.execCommand('insertText', false, text);
      }}
      onClick={(e) => {
        if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return;
        const root = rootRef.current;
        if (!root) return;
        const index = caretTextOffset(root);
        const current = readEditableValue(root);
        const next = tryEvaluateExpressionAt(current, index, Math.random);
        if (next == null || next === current) return;
        e.preventDefault();
        const offset = caretTextOffset(root);
        writeEditableValue(root, next, offset);
        lastValueRef.current = next;
        onChange(next);
        requestAnimationFrame(() => setCaretTextOffset(root, Math.min(offset, next.length)));
      }}
      title="Ctrl+click an expression to evaluate"
    />
  );
}

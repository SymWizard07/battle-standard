import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useScrambleText } from '../hooks/useScrambleText';
import { isStatExpressionHighlight, STAT_EXPRESSION_TOKEN } from '../lib/statExpression';
import {
  cssFontStyle,
  cssFontWeight,
  type TokenNameSegment,
} from '../lib/tokenNameMarkup';
import {
  parseTokenSheetText,
  SHEET_HEADING_COLOR,
} from '../lib/tokenSheetTextMarkup';

function segmentClassName(segment: TokenNameSegment): string {
  const classes: string[] = [];
  if (segment.underline) classes.push('underline');
  if (segment.strikethrough) classes.push('line-through');
  if (segment.obfuscated) classes.push('font-mono');
  return classes.join(' ');
}

function segmentBaseStyle(segment: TokenNameSegment, heading: boolean): CSSProperties {
  return {
    color: heading ? SHEET_HEADING_COLOR : segment.color,
    fontWeight: cssFontWeight(segment.bold || heading),
    fontStyle: cssFontStyle(segment.italic),
  };
}

function renderWithExpressions(
  text: string,
  segment: TokenNameSegment,
  heading: boolean,
  keyPrefix: string,
): ReactNode[] {
  if (!text) return [];
  const nodes: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(STAT_EXPRESSION_TOKEN.source, 'gi');
  let match: RegExpExecArray | null;
  const baseClass = segmentClassName(segment);
  const baseStyle = segmentBaseStyle(segment, heading);

  while ((match = re.exec(text)) != null) {
    const [token] = match;
    if (!isStatExpressionHighlight(token)) continue;
    if (match.index > last) {
      nodes.push(
        <span key={`${keyPrefix}-t-${last}`} className={baseClass} style={baseStyle}>
          {text.slice(last, match.index)}
        </span>,
      );
    }
    nodes.push(
      <span
        key={`${keyPrefix}-e-${match.index}`}
        className={baseClass}
        style={{
          ...baseStyle,
          color: '#38bdf8',
        }}
      >
        {token}
      </span>,
    );
    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(
      <span key={`${keyPrefix}-t-${last}`} className={baseClass} style={baseStyle}>
        {text.slice(last)}
      </span>,
    );
  }

  return nodes.length > 0
    ? nodes
    : [
        <span key={`${keyPrefix}-all`} className={baseClass} style={baseStyle}>
          {text}
        </span>,
      ];
}

function SheetSegmentView({
  segment,
  heading,
  keyPrefix,
}: {
  segment: TokenNameSegment;
  heading: boolean;
  keyPrefix: string;
}) {
  const display = useScrambleText(segment.text, segment.obfuscated);
  return <>{renderWithExpressions(display, segment, heading, keyPrefix)}</>;
}

export function StyledTokenSheetText({
  value,
  className = '',
}: {
  value: string;
  className?: string;
}) {
  const lines = useMemo(() => parseTokenSheetText(value), [value]);

  if (!value) return null;

  return (
    <span className={`block ${className}`}>
      {lines.map((line, lineIndex) => (
        <span
          key={lineIndex}
          className={
            line.heading
              ? 'block w-full border-b pb-0.5 text-base font-semibold leading-snug'
              : 'block text-xs leading-snug'
          }
          style={
            line.heading
              ? { color: SHEET_HEADING_COLOR, borderColor: 'rgba(251, 191, 36, 0.55)' }
              : undefined
          }
        >
          {line.heading ? line.prefix : null}
          {line.segments.length === 0 ? (
            // Preserve blank lines
            '\u00a0'
          ) : (
            line.segments.map((segment, segmentIndex) => (
              <SheetSegmentView
                key={`${lineIndex}-${segmentIndex}`}
                segment={segment}
                heading={line.heading}
                keyPrefix={`${lineIndex}-${segmentIndex}`}
              />
            ))
          )}
        </span>
      ))}
    </span>
  );
}

export function TokenSheetTextSyntaxHint({
  className = '',
  showTitle = false,
}: {
  className?: string;
  showTitle?: boolean;
}) {
  return (
    <div className={className}>
      {showTitle ? (
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Text formatting
        </p>
      ) : null}
      <p className="text-[10px] leading-snug text-slate-500">
        {!showTitle ? 'Formatting: ' : null}
        <code className="text-slate-400"># heading</code>,{' '}
        <code className="text-slate-400">#RGB</code> color,{' '}
        <code className="text-slate-400">#</code> reset,{' '}
        <code className="text-slate-400">*bold*</code>,{' '}
        <code className="text-slate-400">_italic_</code>,{' '}
        <code className="text-slate-400">~underline~</code>,{' '}
        <code className="text-slate-400">-strike-</code>,{' '}
        <code className="text-slate-400">?obfuscate?</code>
      </p>
    </div>
  );
}

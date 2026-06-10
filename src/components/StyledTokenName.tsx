import { useMemo } from 'react';
import { useScrambleText } from '../hooks/useScrambleText';
import {
  cssFontStyle,
  cssFontWeight,
  parseTokenNameMarkup,
  plainTokenName,
  type TokenNameSegment,
} from '../lib/tokenNameMarkup';

interface Props {
  value: string;
  className?: string;
  defaultColor?: string;
  title?: string;
  onDoubleClick?: () => void;
}

function segmentClassName(segment: TokenNameSegment): string {
  const classes: string[] = [];
  if (segment.underline) classes.push('underline');
  if (segment.strikethrough) classes.push('line-through');
  if (segment.obfuscated) classes.push('font-mono');
  return classes.join(' ');
}

function TokenNameSegmentView({ segment }: { segment: TokenNameSegment }) {
  const display = useScrambleText(segment.text, segment.obfuscated);

  return (
    <span
      className={segmentClassName(segment)}
      style={{
        color: segment.color,
        fontWeight: cssFontWeight(segment.bold),
        fontStyle: cssFontStyle(segment.italic),
      }}
    >
      {display}
    </span>
  );
}

export function StyledTokenName({
  value,
  className = '',
  defaultColor,
  title,
  onDoubleClick,
}: Props) {
  const segments = useMemo(
    () => parseTokenNameMarkup(value, defaultColor),
    [value, defaultColor],
  );

  return (
    <span
      className={className}
      title={title ?? plainTokenName(value)}
      onDoubleClick={onDoubleClick}
    >
      {segments.map((segment, index) => (
        <TokenNameSegmentView key={index} segment={segment} />
      ))}
    </span>
  );
}

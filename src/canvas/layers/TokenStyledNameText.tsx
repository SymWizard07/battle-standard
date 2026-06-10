import { Group, Line, Text } from 'react-konva';
import { useMemo } from 'react';
import { useScrambleText } from '../../hooks/useScrambleText';
import {
  DEFAULT_TOKEN_NAME_COLOR,
  konvaFontStyle,
  layoutTokenNameCentered,
  type TokenNameSegment,
} from '../../lib/tokenNameMarkup';

interface Props {
  raw: string;
  width: number;
  height: number;
  fontSize: number;
  defaultFill?: string;
}

function ScrambledKonvaText({
  text,
  obfuscated,
  x,
  y,
  fontSize,
  fontStyle,
  fill,
}: {
  text: string;
  obfuscated: boolean;
  x: number;
  y: number;
  fontSize: number;
  fontStyle: string;
  fill: string;
}) {
  const display = useScrambleText(text, obfuscated);

  return (
    <Text
      x={x}
      y={y}
      text={display}
      fontSize={fontSize}
      fontStyle={fontStyle}
      fill={fill}
      fontFamily={obfuscated ? 'monospace' : undefined}
      listening={false}
    />
  );
}

function renderPiece(
  piece: {
    text: string;
    x: number;
    width: number;
    segment: TokenNameSegment;
  },
  key: string,
  fontSize: number,
) {
  const fill = piece.segment.color;
  const fontStyle = konvaFontStyle(piece.segment);
  const textY = 0;
  const underlineY = textY + fontSize * 0.92;
  const strikeY = textY + fontSize * 0.55;
  const nodes = [
    <ScrambledKonvaText
      key={`${key}-text`}
      x={piece.x}
      y={textY}
      text={piece.text}
      obfuscated={piece.segment.obfuscated}
      fontSize={fontSize}
      fontStyle={fontStyle}
      fill={fill}
    />,
  ];
  if (piece.segment.underline) {
    nodes.push(
      <Line
        key={`${key}-underline`}
        points={[piece.x, underlineY, piece.x + piece.width, underlineY]}
        stroke={fill}
        strokeWidth={Math.max(1, fontSize * 0.07)}
        listening={false}
      />,
    );
  }
  if (piece.segment.strikethrough) {
    nodes.push(
      <Line
        key={`${key}-strike`}
        points={[piece.x, strikeY, piece.x + piece.width, strikeY]}
        stroke={fill}
        strokeWidth={Math.max(1, fontSize * 0.07)}
        listening={false}
      />,
    );
  }
  return nodes;
}

export function TokenStyledNameText({
  raw,
  width,
  height,
  fontSize,
  defaultFill = DEFAULT_TOKEN_NAME_COLOR,
}: Props) {
  const lines = useMemo(
    () => layoutTokenNameCentered(raw, width, height, fontSize, defaultFill),
    [raw, width, height, fontSize, defaultFill],
  );

  return (
    <Group listening={false}>
      {lines.flatMap((line, lineIndex) => (
        <Group key={lineIndex} y={line.y} listening={false}>
          {line.pieces.flatMap((piece, pieceIndex) =>
            renderPiece(piece, `${lineIndex}-${pieceIndex}`, fontSize),
          )}
        </Group>
      ))}
    </Group>
  );
}

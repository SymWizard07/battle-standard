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

/** One host Group per piece — react-konva cannot append arrays/fragments as children. */
function NamePiece({
  piece,
  fontSize,
}: {
  piece: {
    text: string;
    x: number;
    width: number;
    segment: TokenNameSegment;
  };
  fontSize: number;
}) {
  const fill = piece.segment.color;
  const fontStyle = konvaFontStyle(piece.segment);
  const underlineY = fontSize * 0.92;
  const strikeY = fontSize * 0.55;

  return (
    <Group listening={false}>
      <ScrambledKonvaText
        x={piece.x}
        y={0}
        text={piece.text}
        obfuscated={piece.segment.obfuscated}
        fontSize={fontSize}
        fontStyle={fontStyle}
        fill={fill}
      />
      {piece.segment.underline ? (
        <Line
          points={[piece.x, underlineY, piece.x + piece.width, underlineY]}
          stroke={fill}
          strokeWidth={Math.max(1, fontSize * 0.07)}
          listening={false}
        />
      ) : null}
      {piece.segment.strikethrough ? (
        <Line
          points={[piece.x, strikeY, piece.x + piece.width, strikeY]}
          stroke={fill}
          strokeWidth={Math.max(1, fontSize * 0.07)}
          listening={false}
        />
      ) : null}
    </Group>
  );
}

export function TokenStyledNameText({
  raw,
  width,
  height,
  fontSize,
  defaultFill = DEFAULT_TOKEN_NAME_COLOR,
}: Props) {
  const lines = useMemo(
    () => layoutTokenNameCentered(raw ?? '', width, height, fontSize, defaultFill),
    [raw, width, height, fontSize, defaultFill],
  );

  return (
    <Group listening={false}>
      {lines.map((line, lineIndex) => (
        <Group key={lineIndex} y={line.y} listening={false}>
          {line.pieces.map((piece, pieceIndex) => (
            <NamePiece key={pieceIndex} piece={piece} fontSize={fontSize} />
          ))}
        </Group>
      ))}
    </Group>
  );
}

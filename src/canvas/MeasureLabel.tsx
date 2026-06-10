import type Konva from 'konva';
import { Group, Line, Rect, Text } from 'react-konva';

/** Target on-screen size in CSS pixels (constant regardless of map zoom). */
const FONT_SCREEN_PX = 13;
const PAD_SCREEN_PX = 8;
const RADIUS_SCREEN_PX = 6;

export function measureLabelDimensions(text: string, viewScale: number) {
  const scale = Math.max(viewScale, 0.05);
  const fontSize = FONT_SCREEN_PX / scale;
  const padding = PAD_SCREEN_PX / scale;
  const cornerRadius = RADIUS_SCREEN_PX / scale;
  const strokeWidth = Math.max(1, 1 / scale);
  const width = text.length * fontSize * 0.62 + padding * 2;
  const height = fontSize * 1.35 + padding * 2;
  return { scale, fontSize, padding, cornerRadius, strokeWidth, width, height };
}

interface Props {
  x: number;
  y: number;
  text: string;
  viewScale: number;
  /** Pinned measurements show dismiss affordance on hover. */
  dismissible?: boolean;
  hovered?: boolean;
  onHoverChange?: (hovered: boolean) => void;
  onDismiss?: () => void;
}

function stopBubble(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
  e.cancelBubble = true;
}

/** Centered measurement readout with dark rounded backing (screen-constant size). */
export function MeasureLabel({
  x,
  y,
  text,
  viewScale,
  dismissible = false,
  hovered = false,
  onHoverChange,
  onDismiss,
}: Props) {
  const { scale, fontSize, cornerRadius, strokeWidth, width, height } =
    measureLabelDimensions(text, viewScale);
  const xArm = 4 / scale;

  return (
    <Group
      x={x - width / 2}
      y={y - height / 2}
      listening={dismissible}
      onMouseEnter={() => dismissible && onHoverChange?.(true)}
      onMouseLeave={() => dismissible && onHoverChange?.(false)}
      onClick={(e) => {
        if (!dismissible) return;
        stopBubble(e);
        onDismiss?.();
      }}
      onTap={(e) => {
        if (!dismissible) return;
        stopBubble(e);
        onDismiss?.();
      }}
    >
      {dismissible && (
        <Rect
          width={width}
          height={height}
          fill="rgba(0,0,0,0.001)"
          cornerRadius={cornerRadius}
        />
      )}
      <Rect
        width={width}
        height={height}
        fill={
          hovered
            ? 'rgba(71, 85, 105, 0.94)'
            : 'rgba(15, 23, 42, 0.92)'
        }
        stroke={
          hovered
            ? 'rgba(148, 163, 184, 0.75)'
            : 'rgba(251, 191, 36, 0.55)'
        }
        strokeWidth={strokeWidth}
        cornerRadius={cornerRadius}
        listening={false}
      />
      <Text
        text={text}
        x={0}
        y={0}
        width={width}
        height={height}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fontStyle="bold"
        fontFamily="Arial, Helvetica, sans-serif"
        fill="#fef08a"
        opacity={hovered ? 0.35 : 1}
        listening={false}
      />
      {hovered && (
        <Group x={width / 2} y={height / 2} listening={false}>
          <Line
            points={[-xArm, -xArm, xArm, xArm]}
            stroke="#f8fafc"
            strokeWidth={Math.max(1.25, 1.5 / scale)}
            lineCap="round"
          />
          <Line
            points={[xArm, -xArm, -xArm, xArm]}
            stroke="#f8fafc"
            strokeWidth={Math.max(1.25, 1.5 / scale)}
            lineCap="round"
          />
        </Group>
      )}
    </Group>
  );
}

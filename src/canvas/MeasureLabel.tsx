import type Konva from 'konva';
import type { Stage } from 'konva/lib/Stage';
import { Group, Line, Rect, Text } from 'react-konva';
import type { Point } from '../lib/types';

export const MEASURE_LABEL_DISMISS_HIT_NAME = 'measure-label-dismiss';

/** Screen-px bands for proximity fade: solid → semi → gone. */
const LABEL_SOLID_PX = 56;
const LABEL_SEMI_PX = 130;
const LABEL_FADE_PX = 220;
const LABEL_SEMI_OPACITY = 0.48;

/**
 * Opacity from cursor distance to the label center (screen pixels).
 * Close = solid, mid = semi-transparent, far = invisible.
 */
export function measureLabelProximityOpacity(
  distancePx: number | null,
  opts?: { forceSolid?: boolean },
): number {
  if (opts?.forceSolid) return 1;
  if (distancePx == null || !Number.isFinite(distancePx)) return 0;
  if (distancePx <= LABEL_SOLID_PX) return 1;
  if (distancePx <= LABEL_SEMI_PX) {
    const t = (distancePx - LABEL_SOLID_PX) / (LABEL_SEMI_PX - LABEL_SOLID_PX);
    return 1 - t * (1 - LABEL_SEMI_OPACITY);
  }
  if (distancePx <= LABEL_FADE_PX) {
    const t = (distancePx - LABEL_SEMI_PX) / (LABEL_FADE_PX - LABEL_SEMI_PX);
    return LABEL_SEMI_OPACITY * (1 - t);
  }
  return 0;
}

export function isDismissibleMeasureLabelHit(
  stage: Stage | null,
  pointer: Point,
): boolean {
  if (!stage) return false;
  const hit = stage.getIntersection(pointer);
  let node: Konva.Node | null = hit;
  while (node) {
    if (node.name() === MEASURE_LABEL_DISMISS_HIT_NAME) return true;
    node = node.getParent();
  }
  return false;
}

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
  /** Overall visibility (proximity × fade). */
  opacity?: number;
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
  opacity = 1,
  dismissible = false,
  hovered = false,
  onHoverChange,
  onDismiss,
}: Props) {
  const { scale, fontSize, cornerRadius, strokeWidth, width, height } =
    measureLabelDimensions(text, viewScale);
  const xArm = 4 / scale;
  if (opacity <= 0.01) return null;

  return (
    <Group
      name={dismissible ? MEASURE_LABEL_DISMISS_HIT_NAME : undefined}
      x={x - width / 2}
      y={y - height / 2}
      opacity={opacity}
      listening={dismissible && opacity > 0.2}
      onMouseEnter={() => dismissible && onHoverChange?.(true)}
      onMouseLeave={() => dismissible && onHoverChange?.(false)}
      onMouseDown={(e) => {
        if (!dismissible) return;
        stopBubble(e);
      }}
      onTouchStart={(e) => {
        if (!dismissible) return;
        stopBubble(e);
      }}
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

import { mapCornerWorldPoints, mapLocalToWorld, worldToScreen, type MapCorner } from './mapGeometry';
import type { MapTransform } from './types';
import type { Point } from './types';

export interface AxisRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ROTATE_HANDLE_PX = 28;
export const ROTATE_HANDLE_ARM_EXTRA_PX = 28;

export function pointerAngleRad(center: Point, pointer: Point): number {
  return Math.atan2(pointer.y - center.y, pointer.x - center.x);
}

export function pointerDistance(center: Point, pointer: Point): number {
  return Math.hypot(pointer.x - center.x, pointer.y - center.y);
}

/** Pointer is between the handle rest position and the selection center. */
export function isPointerInsideHandleArm(
  center: Point,
  pointer: Point,
  armLengthPx: number,
): boolean {
  return pointerDistance(center, pointer) <= armLengthPx;
}

export function snapDegrees45(deg: number): number {
  return Math.round(deg / 45) * 45;
}

export function handleScreenPosition(
  center: Point,
  handleAngleRad: number,
  armLengthPx: number,
): Point {
  return {
    x: center.x + Math.cos(handleAngleRad) * armLengthPx,
    y: center.y + Math.sin(handleAngleRad) * armLengthPx,
  };
}

/** Midpoint of the local top edge (nw–ne) in screen space. */
export function topEdgeMidpointScreen(cornerScreens: Record<MapCorner, Point>): Point {
  return {
    x: (cornerScreens.nw.x + cornerScreens.ne.x) / 2,
    y: (cornerScreens.nw.y + cornerScreens.ne.y) / 2,
  };
}

/** Place the rotation handle a fixed distance beyond a screen-space edge point. */
export function rotationHandleFromScreenEdge(
  centerScreen: Point,
  edgeAttachScreen: Point,
  extraPx = ROTATE_HANDLE_ARM_EXTRA_PX,
): { attachScreen: Point; handleScreen: Point; armLengthPx: number } {
  const dx = edgeAttachScreen.x - centerScreen.x;
  const dy = edgeAttachScreen.y - centerScreen.y;
  const edgeDist = Math.hypot(dx, dy);
  if (edgeDist < 1e-6) {
    return {
      attachScreen: edgeAttachScreen,
      handleScreen: { x: edgeAttachScreen.x, y: edgeAttachScreen.y - extraPx },
      armLengthPx: extraPx,
    };
  }
  const ux = dx / edgeDist;
  const uy = dy / edgeDist;
  const armLengthPx = edgeDist + extraPx;
  return {
    attachScreen: edgeAttachScreen,
    handleScreen: {
      x: centerScreen.x + ux * armLengthPx,
      y: centerScreen.y + uy * armLengthPx,
    },
    armLengthPx,
  };
}

export function rotationHandleFromCornerScreens(
  centerScreen: Point,
  cornerScreens: Record<MapCorner, Point>,
  extraPx = ROTATE_HANDLE_ARM_EXTRA_PX,
): { attachScreen: Point; handleScreen: Point; armLengthPx: number } {
  return rotationHandleFromScreenEdge(
    centerScreen,
    topEdgeMidpointScreen(cornerScreens),
    extraPx,
  );
}

/** Rotation in degrees; snaps to 45° when the pointer is inside the handle arm or Shift is held. */
export function rotationDegreesFromPointerDrag(
  center: Point,
  pointer: Point,
  dragStartPointer: Point,
  startRotationDeg: number,
  armLengthPx: number,
  shiftKey = false,
): number {
  const startAngle = pointerAngleRad(center, dragStartPointer);
  const currentAngle = pointerAngleRad(center, pointer);
  const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI;
  let rotationDeg = startRotationDeg + deltaDeg;
  if (shiftKey || isPointerInsideHandleArm(center, pointer, armLengthPx)) {
    rotationDeg = snapDegrees45(rotationDeg);
  }
  return rotationDeg;
}

export function rotationToHandleAngleRad(rotationDeg: number): number {
  return ((rotationDeg - 90) * Math.PI) / 180;
}

export function rotationHandleAttachOnRect(
  center: Point,
  handleAngleRad: number,
  rect: { x: number; y: number; width: number; height: number },
): Point {
  const dx = Math.cos(handleAngleRad);
  const dy = Math.sin(handleAngleRad);
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return { x: center.x, y: top };
  }

  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (right - center.x) / dx);
  else if (dx < -1e-9) t = Math.min(t, (left - center.x) / dx);
  if (dy > 1e-9) t = Math.min(t, (bottom - center.y) / dy);
  else if (dy < -1e-9) t = Math.min(t, (top - center.y) / dy);

  if (!Number.isFinite(t) || t <= 0) {
    return { x: center.x + dx * 8, y: center.y + dy * 8 };
  }
  return { x: center.x + dx * t, y: center.y + dy * t };
}

export function defaultHandleAngleRad(): number {
  return -Math.PI / 2;
}

function rectCenter(rect: AxisRect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function localCornerToWorld(
  center: Point,
  localX: number,
  localY: number,
  rotationDeg: number,
): Point {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: center.x + cos * localX - sin * localY,
    y: center.y + sin * localX + cos * localY,
  };
}

export function rotatedRectCornerPointsWorld(
  rect: AxisRect,
  rotationDeg: number,
): Record<MapCorner, Point> {
  const center = rectCenter(rect);
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  return {
    nw: localCornerToWorld(center, -hw, -hh, rotationDeg),
    ne: localCornerToWorld(center, hw, -hh, rotationDeg),
    se: localCornerToWorld(center, hw, hh, rotationDeg),
    sw: localCornerToWorld(center, -hw, hh, rotationDeg),
  };
}

export function rotatedRectTopCenterWorld(rect: AxisRect, rotationDeg: number): Point {
  const center = rectCenter(rect);
  const hh = rect.height / 2;
  return localCornerToWorld(center, 0, -hh, rotationDeg);
}

export function rotatedRectBoxStyleScreen(
  rect: AxisRect,
  rotationDeg: number,
  stagePos: Point,
  viewScale: number,
): {
  left: number;
  top: number;
  width: number;
  height: number;
  transform: string;
  transformOrigin: string;
} {
  const nw = worldToScreen(rotatedRectCornerPointsWorld(rect, rotationDeg).nw, stagePos, viewScale);
  return {
    left: nw.x,
    top: nw.y,
    width: rect.width * viewScale,
    height: rect.height * viewScale,
    transform: `rotate(${rotationDeg}deg)`,
    transformOrigin: '0 0',
  };
}

export function rotatedRectCornersScreen(
  rect: AxisRect,
  rotationDeg: number,
  stagePos: Point,
  viewScale: number,
): Record<MapCorner, Point> {
  const world = rotatedRectCornerPointsWorld(rect, rotationDeg);
  return {
    nw: worldToScreen(world.nw, stagePos, viewScale),
    ne: worldToScreen(world.ne, stagePos, viewScale),
    se: worldToScreen(world.se, stagePos, viewScale),
    sw: worldToScreen(world.sw, stagePos, viewScale),
  };
}

export function rotatedRectCenterScreen(
  rect: AxisRect,
  stagePos: Point,
  viewScale: number,
): Point {
  return worldToScreen(rectCenter(rect), stagePos, viewScale);
}

export function rotatedRectRotationHandleScreen(
  rect: AxisRect,
  rotationDeg: number,
  stagePos: Point,
  viewScale: number,
  extraPx = ROTATE_HANDLE_ARM_EXTRA_PX,
): { attachScreen: Point; handleScreen: Point; armLengthPx: number } {
  const centerScreen = rotatedRectCenterScreen(rect, stagePos, viewScale);
  const cornerScreens = rotatedRectCornersScreen(rect, rotationDeg, stagePos, viewScale);
  return rotationHandleFromCornerScreens(centerScreen, cornerScreens, extraPx);
}

export function rotatedRectHandleArmLengthScreen(
  rect: AxisRect,
  rotationDeg: number,
  stagePos: Point,
  viewScale: number,
  extraPx = ROTATE_HANDLE_ARM_EXTRA_PX,
): number {
  return rotatedRectRotationHandleScreen(rect, rotationDeg, stagePos, viewScale, extraPx)
    .armLengthPx;
}

export function mapRotationHandleScreen(
  mt: MapTransform,
  imageWidth: number,
  imageHeight: number,
  stagePos: Point,
  viewScale: number,
  extraPx = ROTATE_HANDLE_ARM_EXTRA_PX,
): {
  centerScreen: Point;
  attachScreen: Point;
  handleScreen: Point;
  armLengthPx: number;
} {
  const corners = mapCornerWorldPoints(mt, imageWidth, imageHeight);
  const cornerScreens = {
    nw: worldToScreen(corners.nw, stagePos, viewScale),
    ne: worldToScreen(corners.ne, stagePos, viewScale),
    se: worldToScreen(corners.se, stagePos, viewScale),
    sw: worldToScreen(corners.sw, stagePos, viewScale),
  };
  const centerScreen = worldToScreen(
    mapLocalToWorld({ x: imageWidth / 2, y: imageHeight / 2 }, mt),
    stagePos,
    viewScale,
  );
  const { attachScreen, handleScreen, armLengthPx } = rotationHandleFromCornerScreens(
    centerScreen,
    cornerScreens,
    extraPx,
  );
  return { centerScreen, attachScreen, handleScreen, armLengthPx };
}

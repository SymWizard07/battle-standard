import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import { HOVER_Y } from './diceTypes';

/** Mouse delta gain so the grab feels slightly loose / disjointed. */
export const DRAG_GAIN = 1.55;

/**
 * Diminishing-returns curve with no hard ceiling.
 * Linear up to `knee`, then log growth so faster input still adds speed, just less.
 */
export function softMagnitude(value: number, knee: number, softness: number): number {
  const v = Math.abs(value);
  if (v <= knee) return v;
  return knee + softness * Math.log1p((v - knee) / softness);
}

/** Overall throw strength (planar fling + swirl). */
export const THROW_SPEED_SCALE = 0.5;

/** Scale a planar velocity by softMagnitude (direction unchanged). */
export function softPlanarVelocity(
  vx: number,
  vz: number,
  knee = 16,
  softness = 22,
): { vx: number; vz: number; speed: number } {
  const speed = Math.hypot(vx, vz);
  if (speed < 1e-8) return { vx: 0, vz: 0, speed: 0 };
  const out = softMagnitude(speed, knee, softness) * THROW_SPEED_SCALE;
  const k = out / speed;
  return { vx: vx * k, vz: vz * k, speed: out };
}

/** Soften signed angular rate the same way (no ±clamp). */
export function softSpinRate(w: number, knee = 32, softness = 40): number {
  if (w === 0) return 0;
  return Math.sign(w) * softMagnitude(w, knee, softness);
}

/**
 * Live hover-drag motion shared with PhysicsDie (ball-roll + swirl).
 * Updated by DiceTrayScene while a grab is active.
 */
export const hoverDragMotion = {
  vx: 0,
  vz: 0,
  /** Cursor heading rate (rad/s) — circling the mouse spins dice about Y. */
  spinY: 0,
  /** True for the whole grab (ref, not React state — avoids one-frame lag). */
  active: false,
};

export function resetHoverDragMotion() {
  hoverDragMotion.vx = 0;
  hoverDragMotion.vz = 0;
  hoverDragMotion.spinY = 0;
  hoverDragMotion.active = false;
}

const hoverPlane = new Plane(new Vector3(0, 1, 0), -HOVER_Y);
const ndc = new Vector2();
const hit = new Vector3();
const raycaster = new Raycaster();

/** Project client coords through the camera onto the hover plane (works outside the canvas). */
export function clientPointOnHoverPlane(
  clientX: number,
  clientY: number,
  camera: Camera,
  canvas: HTMLCanvasElement,
): { x: number; z: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(hoverPlane, hit)) return null;
  return { x: hit.x, z: hit.z };
}

export function pointerOutsideWindow(e: PointerEvent): boolean {
  return (
    e.clientX <= 0 ||
    e.clientY <= 0 ||
    e.clientX >= window.innerWidth ||
    e.clientY >= window.innerHeight
  );
}

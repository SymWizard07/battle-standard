import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import { HOVER_Y } from './diceTypes';

/** Mouse delta gain so the grab feels slightly loose / disjointed. */
export const DRAG_GAIN = 1.55;

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

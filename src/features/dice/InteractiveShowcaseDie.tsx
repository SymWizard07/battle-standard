import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Quaternion, Vector2, Vector3 } from 'three';
import { DieVisual } from './DieVisual';
import { useDieFaceShaderStore } from './dieFaceShaderStore';
import { getDieMeshSpec } from './diceMeshes';
import { dieScale, type DiceSides } from './diceTypes';
import { quatFromTo, type FaceDef } from './faceRead';

type Props = {
  sides: DiceSides;
  position: [number, number, number];
  /** When false, freeze simulation (settings tab inactive). */
  active?: boolean;
};

const LEAN_MAX = 0.24;
const LEAN_BLEND = 10;
const DRAG_SPIN = 0.085;
const DRAG_DAMP = 0.12;
const DAMP = 1.35;
const SNAP_SPEED = 1.1;
const SNAP_ENTER = 0.4;
const SNAP_BLEND = 6;
/** Extra rest tip for d4/d6 so neighboring faces read (radians). */
const CUBE_TIP_DOWN = 0.34;
const CUBE_TIP_LEFT = 0.3;

function faceTowardCamera(
  faces: FaceDef[],
  value: number,
  towardCam: Vector3,
  screenUp: Vector3,
): Quaternion {
  const face = faces.find((f) => f.value === value) ?? faces[0];
  if (!face) return new Quaternion();
  const localOut = new Vector3(face.normal[0], face.normal[1], face.normal[2]).normalize();
  const toCam = quatFromTo(localOut, towardCam);

  const localAlign = new Vector3();
  if (face.align) {
    localAlign.set(face.align[0], face.align[1], face.align[2]);
  } else {
    localAlign.set(1, 0, 0);
    if (Math.abs(localOut.dot(localAlign)) > 0.9) localAlign.set(0, 0, 1);
    localAlign.crossVectors(localOut, localAlign).normalize();
  }
  localAlign.addScaledVector(localOut, -localAlign.dot(localOut));
  if (localAlign.lengthSq() < 1e-10) return toCam;
  localAlign.normalize();

  const worldAlign = localAlign.applyQuaternion(toCam);
  worldAlign.addScaledVector(towardCam, -worldAlign.dot(towardCam));
  if (worldAlign.lengthSq() < 1e-6) return toCam;
  worldAlign.normalize();

  const desired = screenUp.clone();
  desired.addScaledVector(towardCam, -desired.dot(towardCam));
  if (desired.lengthSq() < 1e-6) desired.set(0, 1, 0);
  desired.normalize();

  return quatFromTo(worldAlign, desired).multiply(toCam);
}

/** Face toward camera, with a slight down-left tip on d4/d6 to show adjacent faces. */
function restOrientation(
  sides: DiceSides,
  faces: FaceDef[],
  value: number,
  towardCam: Vector3,
  screenUp: Vector3,
  camRight: Vector3,
  camUp: Vector3,
): Quaternion {
  const q = faceTowardCamera(faces, value, towardCam, screenUp);
  if (sides !== 4 && sides !== 6) return q;
  const tip = new Quaternion()
    .setFromAxisAngle(camRight, CUBE_TIP_DOWN)
    .multiply(new Quaternion().setFromAxisAngle(camUp, -CUBE_TIP_LEFT));
  return tip.multiply(q);
}

function nearestFaceTowardCamera(
  faces: FaceDef[],
  quat: Quaternion,
  towardCam: Vector3,
): number {
  let best = faces[0]!;
  let bestScore = -Infinity;
  const n = new Vector3();
  for (const face of faces) {
    n.set(face.normal[0], face.normal[1], face.normal[2]).normalize().applyQuaternion(quat);
    const score = n.dot(towardCam);
    if (score > bestScore) {
      bestScore = score;
      best = face;
    }
  }
  return best.value;
}

function updateCameraBasis(
  camera: { quaternion: Quaternion; getWorldDirection: (v: Vector3) => Vector3 },
  towardCam: Vector3,
  camRight: Vector3,
  camUp: Vector3,
) {
  camera.getWorldDirection(towardCam);
  towardCam.negate();
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  camRight.crossVectors(camUp, towardCam).normalize();
  camUp.crossVectors(towardCam, camRight).normalize();
}

/** Interactive showcase die: hover lean, drag-spin with inertia, snap to camera-facing face. */
export function InteractiveShowcaseDie({ sides, position, active = true }: Props) {
  const groupRef = useRef<Group>(null);
  const { camera, gl, invalidate } = useThree();
  const spec = useMemo(() => getDieMeshSpec(sides), [sides]);
  const visualScale = dieScale(sides) * 1.85;
  const shaderDragSource = useDieFaceShaderStore((s) => s.dragSource);
  const setShader = useDieFaceShaderStore((s) => s.setShader);
  const endShaderDrag = useDieFaceShaderStore((s) => s.endDrag);
  const [dropHover, setDropHover] = useState(false);

  const baseQ = useRef(new Quaternion());
  const omega = useRef(new Vector3());
  const dragging = useRef(false);
  const hovered = useRef(false);
  const pointer = useRef(new Vector2(0, 0));
  const settling = useRef(false);
  const settleTarget = useRef(new Quaternion());
  const leanQ = useRef(new Quaternion());
  const leanTargetQ = useRef(new Quaternion());
  const tmpQ = useRef(new Quaternion());
  const camRight = useRef(new Vector3());
  const camUp = useRef(new Vector3());
  const towardCam = useRef(new Vector3());
  const axis = useRef(new Vector3());
  const proj = useRef(new Vector3());

  const setPointerNdc = (clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    pointer.current.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1),
    );
  };

  const endDrag = (clientX: number, clientY: number) => {
    if (!dragging.current) return;
    dragging.current = false;
    setPointerNdc(clientX, clientY);
    gl.domElement.style.cursor = hovered.current ? 'grab' : 'default';
    updateCameraBasis(camera, towardCam.current, camRight.current, camUp.current);
    if (omega.current.length() < SNAP_SPEED) {
      const value = nearestFaceTowardCamera(
        spec.faces,
        baseQ.current,
        towardCam.current,
      );
      settleTarget.current.copy(
        restOrientation(
          sides,
          spec.faces,
          value,
          towardCam.current,
          camUp.current,
          camRight.current,
          camUp.current,
        ),
      );
      settling.current = true;
      omega.current.set(0, 0, 0);
    }
    invalidate();
  };

  useEffect(() => {
    towardCam.current.set(0, 0.15, 1).normalize();
    camRight.current.set(1, 0, 0);
    camUp.current.set(0, 1, 0);
    const value = nearestFaceTowardCamera(spec.faces, new Quaternion(), towardCam.current);
    baseQ.current.copy(
      restOrientation(
        sides,
        spec.faces,
        value,
        towardCam.current,
        camUp.current,
        camRight.current,
        camUp.current,
      ),
    );
    if (groupRef.current) groupRef.current.quaternion.copy(baseQ.current);
    invalidate();
  }, [sides, spec.faces, invalidate]);

  // Window-level drag so spin continues off the die / canvas.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      setPointerNdc(e.clientX, e.clientY);
      updateCameraBasis(camera, towardCam.current, camRight.current, camUp.current);
      omega.current.addScaledVector(camUp.current, e.movementX * DRAG_SPIN);
      omega.current.addScaledVector(camRight.current, e.movementY * DRAG_SPIN);
      const maxW = 40;
      if (omega.current.length() > maxW) omega.current.setLength(maxW);
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      endDrag(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [camera, gl, invalidate, spec.faces]);

  useFrame((_, dt) => {
    if (!active || !groupRef.current) return;
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    const g = groupRef.current;

    updateCameraBasis(camera, towardCam.current, camRight.current, camUp.current);

    if (dragging.current) {
      settling.current = false;
      const w = omega.current;
      const speed = w.length();
      if (speed > 1e-6) {
        axis.current.copy(w).multiplyScalar(1 / speed);
        tmpQ.current.setFromAxisAngle(axis.current, speed * clampedDt);
        baseQ.current.premultiply(tmpQ.current).normalize();
      }
      omega.current.multiplyScalar(Math.exp(-DRAG_DAMP * clampedDt));
    } else if (settling.current) {
      baseQ.current.slerp(settleTarget.current, 1 - Math.exp(-SNAP_BLEND * clampedDt));
      if (baseQ.current.angleTo(settleTarget.current) < 0.02) {
        baseQ.current.copy(settleTarget.current);
        settling.current = false;
        omega.current.set(0, 0, 0);
      }
    } else {
      const speed = omega.current.length();
      if (speed > 1e-5) {
        axis.current.copy(omega.current).multiplyScalar(1 / speed);
        tmpQ.current.setFromAxisAngle(axis.current, speed * clampedDt);
        baseQ.current.premultiply(tmpQ.current).normalize();
        omega.current.multiplyScalar(Math.exp(-DAMP * clampedDt));
        if (omega.current.length() < SNAP_ENTER) {
          const value = nearestFaceTowardCamera(
            spec.faces,
            baseQ.current,
            towardCam.current,
          );
          settleTarget.current.copy(
            restOrientation(
              sides,
              spec.faces,
              value,
              towardCam.current,
              camUp.current,
              camRight.current,
              camUp.current,
            ),
          );
          settling.current = true;
          omega.current.set(0, 0, 0);
        }
      }
    }

    // Smooth hover lean (slerp toward target; ease back to identity off-hover).
    leanTargetQ.current.identity();
    if (hovered.current && !dragging.current) {
      proj.current.set(position[0], position[1], position[2]).project(camera);
      const dx = Math.max(-1, Math.min(1, pointer.current.x - proj.current.x));
      const dy = Math.max(-1, Math.min(1, pointer.current.y - proj.current.y));
      tmpQ.current.setFromAxisAngle(camRight.current, -dy * LEAN_MAX);
      leanTargetQ.current.copy(tmpQ.current);
      tmpQ.current.setFromAxisAngle(camUp.current, dx * LEAN_MAX);
      leanTargetQ.current.multiply(tmpQ.current);
    }
    leanQ.current.slerp(leanTargetQ.current, 1 - Math.exp(-LEAN_BLEND * clampedDt));

    g.quaternion.copy(leanQ.current).multiply(baseQ.current);

    if (
      dragging.current ||
      settling.current ||
      hovered.current ||
      leanQ.current.angleTo(leanTargetQ.current) > 0.005 ||
      omega.current.lengthSq() > 1e-8
    ) {
      invalidate();
    }
  });

  const onHoverMove = (e: ThreeEvent<PointerEvent>) => {
    if (dragging.current) return;
    setPointerNdc(e.clientX, e.clientY);
    if (hovered.current) invalidate();
  };

  const dropHighlight = shaderDragSource != null && dropHover;

  return (
    <group
      ref={groupRef}
      position={position}
      scale={dropHighlight ? 1.08 : 1}
      onPointerOver={(e) => {
        e.stopPropagation();
        hovered.current = true;
        if (shaderDragSource) {
          setDropHover(true);
          gl.domElement.style.cursor = 'copy';
        } else {
          gl.domElement.style.cursor = 'grab';
        }
        setPointerNdc(e.clientX, e.clientY);
        invalidate();
      }}
      onPointerOut={() => {
        hovered.current = false;
        setDropHover(false);
        if (!dragging.current) {
          gl.domElement.style.cursor = shaderDragSource ? 'grabbing' : 'default';
        }
        invalidate();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (shaderDragSource) return;
        dragging.current = true;
        settling.current = false;
        gl.domElement.style.cursor = 'grabbing';
        setPointerNdc(e.clientX, e.clientY);
        invalidate();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        const source = useDieFaceShaderStore.getState().dragSource;
        if (!source) return;
        setShader(sides, source);
        endShaderDrag();
        setDropHover(false);
        gl.domElement.style.cursor = hovered.current ? 'grab' : 'default';
        invalidate();
      }}
      onPointerMove={onHoverMove}
    >
      <DieVisual sides={sides} scale={visualScale} showLabels />
      <mesh visible={false}>
        <sphereGeometry args={[0.85, 12, 12]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

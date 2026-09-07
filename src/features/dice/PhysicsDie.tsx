import { useFrame, useThree } from '@react-three/fiber';
import {
  ConvexHullCollider,
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import { useEffect, useMemo, useRef } from 'react';
import { Quaternion, Vector3, type BufferGeometry } from 'three';
import { getDieMeshSpec } from './diceMeshes';
import { DieVisual } from './DieVisual';
import { presentOrientation, readDieResult } from './faceRead';
import { computeClusterSlot } from './trayLayout';
import { dieScale, HOVER_Y, type DiceSides, type DiePhase } from './diceTypes';

const MIN_FALL_SEC = 0.85;
/** Linear speed below which a die may be considered at rest. */
const SETTLE_LIN_SPEED = 0.25;
/** Angular speed below which a die may be considered at rest. */
const SETTLE_ANG_SPEED = 1.35;
/** Only clear the quiet streak if motion clearly exceeds settle thresholds. */
const SETTLE_RESET_LIN = 0.55;
const SETTLE_RESET_ANG = 2.8;
/** Frames of near-still motion before we lock the nearest upward face. */
const SETTLE_QUIET_FRAMES = 22;
/**
 * Max center height that still counts as "landed" (felt + a die or two stacked).
 * Old near-floor gate (~0.85) rejected dice resting on other dice.
 */
const MAX_SETTLE_Y = 2.15;
/** Still falling through the air if descending faster than this. */
const MAX_SETTLE_DOWN_VY = 0.4;
/** Below the felt — treat as escaped and respawn above the camera. */
const OUT_OF_BOUNDS_Y = -1.25;
/** Linear hover-plane restore (N-ish per unit displacement). */
const HOVER_STAB_K = 14;
/** Extra restore that grows with |Δy| — stronger the farther from the plane. */
const HOVER_STAB_K_FAR = 22;
/** Vertical velocity damping while hovering. */
const HOVER_STAB_DAMP = 4.5;
const HOVER_PLANAR_DAMP_FORCE = 0.35;
/** How quickly spin matches planar velocity (ball-roll ω = v × n̂ / r). */
const HOVER_ROLL_SYNC = 16;

function rollRadius(sides: DiceSides): number {
  // Circumradius of the mesh × scale — spin about the geometric center.
  const spec = getDieMeshSpec(sides);
  return Math.max(0.12, spec.radius * dieScale(sides));
}

/** Unique scaled vertices for a convex hull matching the rendered die. */
function hullPointsFromGeometry(geometry: BufferGeometry, scale: number): Float32Array {
  // Tiny inflate so the visual face sits on the felt instead of sinking through it.
  const s = scale * 1.02;
  const pos = geometry.getAttribute('position');
  const pts: number[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * s;
    const y = pos.getY(i) * s;
    const z = pos.getZ(i) * s;
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push(x, y, z);
  }
  return new Float32Array(pts);
}

type Props = {
  id: string;
  sides: DiceSides;
  phase: DiePhase;
  value: number | null;
  spawnIndex: number;
  spawnCount: number;
  trayHalfW: number;
  trayHalfD: number;
  presentTarget: { x: number; z: number } | null;
  /** Seconds to wait before starting the present flight (settle-order stagger). */
  presentDelaySec?: number;
  rollId: number;
  /** Whole tray is in hover-drag physics (collisions enabled). */
  hoverPhysics: boolean;
  onSettled: (id: string, value: number) => void;
  /** Begin a tray-wide drag session (scene owns move/up until release). */
  onHoverDragPointerDown: (id: string, pointerId: number, clientX: number, clientY: number) => void;
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  flingVelocity: Vector3 | null;
};

export function PhysicsDie({
  id,
  sides,
  phase,
  value,
  spawnIndex,
  spawnCount,
  trayHalfW,
  trayHalfD,
  presentTarget,
  presentDelaySec = 0,
  rollId,
  hoverPhysics,
  onSettled,
  onHoverDragPointerDown,
  registerBody,
  flingVelocity,
}: Props) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const camera = useThree((s) => s.camera);
  const spec = useMemo(() => getDieMeshSpec(sides), [sides]);
  const hullPoints = useMemo(
    () => hullPointsFromGeometry(spec.geometry, dieScale(sides)),
    [spec.geometry, sides],
  );
  const quietFrames = useRef(0);
  const reported = useRef(false);
  const fallStartedAt = useRef(0);
  const sawMotion = useRef(false);
  const presentT = useRef(0);
  const presentWait = useRef(0);
  const presentFromPos = useRef(new Vector3());
  const presentFromQuat = useRef(new Quaternion());
  const launchedRollId = useRef(-1);
  const prevPhase = useRef(phase);

  const stagingPos = useMemo(() => {
    const slot = computeClusterSlot(spawnIndex, spawnCount, trayHalfW, trayHalfD);
    return new Vector3(slot.x, HOVER_Y, slot.z);
  }, [spawnIndex, spawnCount, trayHalfW, trayHalfD]);

  useEffect(() => {
    registerBody(id, bodyRef.current);
    return () => registerBody(id, null);
  }, [id, registerBody]);

  useEffect(() => {
    if (phase === 'falling' && prevPhase.current !== 'falling') {
      fallStartedAt.current = 0;
      reported.current = false;
      quietFrames.current = 0;
      sawMotion.current = false;
    }
    prevPhase.current = phase;
  }, [phase]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (phase === 'staging' && !hoverPhysics) {
      reported.current = false;
      quietFrames.current = 0;
      presentT.current = 0;
      sawMotion.current = false;
      fallStartedAt.current = 0;
      launchedRollId.current = -1;
      body.setBodyType(RigidBodyType.KinematicPositionBased, true);
      body.setTranslation(stagingPos, true);
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }, [phase, stagingPos, hoverPhysics]);

  // Keep dynamic + zero-g while the tray is in hover-drag (scene arms bodies on grab).
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (!hoverPhysics) return;
    if (phase !== 'staging' && phase !== 'staged') return;
    body.setBodyType(RigidBodyType.Dynamic, true);
    body.setGravityScale(0, true);
    body.wakeUp();
  }, [hoverPhysics, phase]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || phase !== 'falling') return;
    // Relaunch once per rollId (atomic with fling props from the store).
    if (launchedRollId.current === rollId) return;
    launchedRollId.current = rollId;

    reported.current = false;
    quietFrames.current = 0;
    sawMotion.current = false;
    fallStartedAt.current = performance.now();

    body.setGravityScale(1, true);
    body.setBodyType(RigidBodyType.Dynamic, true);
    const t = body.translation();
    body.setTranslation({ x: t.x, y: Math.max(t.y, HOVER_Y), z: t.z }, true);

    const v =
      flingVelocity?.clone() ??
      new Vector3(
        (Math.random() - 0.5) * 4.2,
        5.5 + Math.random() * 2.8,
        (Math.random() - 0.5) * 4.2,
      );
    // Guarantee a real toss into the tray (never a soft settle-in-place).
    if (Math.hypot(v.x, v.z) < 1.2) {
      v.x += (Math.random() - 0.5) * 3.0;
      v.z += (Math.random() - 0.5) * 3.0;
    }
    if (flingVelocity) {
      // Cursor-release: drive into the felt.
      v.y = Math.min(v.y, -3.0);
    } else {
      // Drop button: loft upward so they tumble back into the tray.
      v.y = Math.max(v.y, 5.2);
    }

    body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    const spin = flingVelocity ? 16 : 42;
    body.setAngvel(
      {
        x: (Math.random() - 0.5) * spin,
        y: (Math.random() - 0.5) * spin,
        z: (Math.random() - 0.5) * spin,
      },
      true,
    );
    body.wakeUp();
  }, [phase, rollId, flingVelocity]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || phase !== 'presenting' || !presentTarget) return;
    presentT.current = 0;
    presentWait.current = 0;
    const t = body.translation();
    const r = body.rotation();
    presentFromPos.current.set(t.x, t.y, t.z);
    presentFromQuat.current.set(r.x, r.y, r.z, r.w);
    body.setBodyType(RigidBodyType.KinematicPositionBased, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, [phase, presentTarget]);

  useFrame((_, dt) => {
    const body = bodyRef.current;
    if (!body) return;

    if (hoverPhysics && (phase === 'staging' || phase === 'staged')) {
      const t = body.translation();
      const lv = body.linvel();
      const av = body.angvel();
      const mass = Math.max(0.15, body.mass());
      const dy = t.y - HOVER_Y;
      // Stabilizing force: linear + distance-scaled term (stronger farther from plane).
      const stab =
        -(HOVER_STAB_K + HOVER_STAB_K_FAR * Math.abs(dy)) * dy -
        HOVER_STAB_DAMP * lv.y;
      body.applyImpulse(
        {
          x: -lv.x * HOVER_PLANAR_DAMP_FORCE * mass * dt,
          y: stab * mass * dt,
          z: -lv.z * HOVER_PLANAR_DAMP_FORCE * mass * dt,
        },
        true,
      );

      // Smooth ball-roll opposite the drag: spin against planar velocity.
      const r = rollRadius(sides);
      const targetWx = lv.z / r;
      const targetWz = -lv.x / r;
      const k = 1 - Math.exp(-HOVER_ROLL_SYNC * dt);
      body.setAngvel(
        {
          x: av.x + (targetWx - av.x) * k,
          y: av.y * (1 - k),
          z: av.z + (targetWz - av.z) * k,
        },
        true,
      );

      // Soft wall keep-in (XZ only — Y is force-stabilized, no ceiling/floor).
      const margin = dieScale(sides) * 0.7;
      const maxX = trayHalfW - margin;
      const maxZ = trayHalfD - margin;
      const nx = Math.max(-maxX, Math.min(maxX, t.x));
      const nz = Math.max(-maxZ, Math.min(maxZ, t.z));
      if (nx !== t.x || nz !== t.z) {
        body.setTranslation({ x: nx, y: t.y, z: nz }, true);
        body.setLinvel(
          {
            x: nx !== t.x ? 0 : lv.x,
            y: lv.y,
            z: nz !== t.z ? 0 : lv.z,
          },
          true,
        );
      }
      return;
    }

    if (phase === 'falling' && !reported.current) {
      // Wait until launch effect has stamped a start time.
      if (!fallStartedAt.current) return;

      const t = body.translation();
      // Escaped below the tray — drop back in from above the camera.
      if (t.y < OUT_OF_BOUNDS_Y) {
        const dropY = Math.max(camera.position.y + 2.2, HOVER_Y + 4);
        const x = (Math.random() - 0.5) * trayHalfW * 0.7;
        const z = (Math.random() - 0.5) * trayHalfD * 0.7;
        body.setTranslation({ x, y: dropY, z }, true);
        body.setLinvel(
          {
            x: (Math.random() - 0.5) * 1.6,
            y: -4.5 - Math.random() * 1.5,
            z: (Math.random() - 0.5) * 1.6,
          },
          true,
        );
        body.setAngvel(
          {
            x: (Math.random() - 0.5) * 12,
            y: (Math.random() - 0.5) * 12,
            z: (Math.random() - 0.5) * 12,
          },
          true,
        );
        body.wakeUp();
        quietFrames.current = 0;
        sawMotion.current = true;
        return;
      }

      const lv = body.linvel();
      const av = body.angvel();
      const linSpeed = Math.hypot(lv.x, lv.y, lv.z);
      const angSpeed = Math.hypot(av.x, av.y, av.z);
      if (linSpeed > 0.6 || angSpeed > 2.5) sawMotion.current = true;

      const elapsed = (performance.now() - fallStartedAt.current) / 1000;
      // Allow stacked dice (above another die) — only reject free-fall / OOB.
      const landedHeight = t.y < MAX_SETTLE_Y && t.y > OUT_OF_BOUNDS_Y;
      const notPlunging = lv.y > -MAX_SETTLE_DOWN_VY;
      const isStill =
        linSpeed < SETTLE_LIN_SPEED &&
        angSpeed < SETTLE_ANG_SPEED &&
        notPlunging;
      const canSettle =
        elapsed >= MIN_FALL_SEC &&
        landedHeight &&
        sawMotion.current &&
        isStill;

      if (canSettle) {
        quietFrames.current += 1;
        // Once truly still, lock the nearest upward face — no tip/nudge impulses.
        if (quietFrames.current > SETTLE_QUIET_FRAMES) {
          const r = body.rotation();
          const q = new Quaternion(r.x, r.y, r.z, r.w).normalize();
          const result = readDieResult(spec.faces, q, spec.vertices);
          reported.current = true;
          body.setBodyType(RigidBodyType.Fixed, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          onSettled(id, result);
        }
      } else if (
        linSpeed > SETTLE_RESET_LIN ||
        angSpeed > SETTLE_RESET_ANG ||
        lv.y < -MAX_SETTLE_DOWN_VY
      ) {
        // Clear quiet only on real motion — ignore micro-jitter from stacked contacts.
        quietFrames.current = 0;
      } else if (quietFrames.current > 0) {
        quietFrames.current = Math.max(0, quietFrames.current - 1);
      }
    }

    if (phase === 'presenting' && presentTarget && value != null) {
      // Hold on the table until this die's settle-order turn.
      if (presentWait.current < presentDelaySec) {
        presentWait.current += dt;
        body.setNextKinematicTranslation(presentFromPos.current);
        body.setNextKinematicRotation(presentFromQuat.current);
        return;
      }
      presentT.current = Math.min(1, presentT.current + dt * 1.6);
      const t = presentT.current;
      const e = t * t * (3 - 2 * t);
      const to = new Vector3(presentTarget.x, HOVER_Y, presentTarget.z);
      const pos = presentFromPos.current.clone().lerp(to, e);
      const targetQ = presentOrientation(spec.faces, value, undefined, spec.vertices);
      const q = presentFromQuat.current.clone().slerp(targetQ, e);
      body.setNextKinematicTranslation(pos);
      body.setNextKinematicRotation(q);
    }

    // Hold reveal pose — but never while the user is dragging a re-roll.
    // If present slots were cleared (e.g. a new die was added), regroup onto the spawn cluster.
    if (phase === 'staged' && value != null && !hoverPhysics) {
      const targetQ = presentOrientation(spec.faces, value, undefined, spec.vertices);
      if (presentTarget) {
        body.setNextKinematicTranslation({
          x: presentTarget.x,
          y: HOVER_Y,
          z: presentTarget.z,
        });
      } else {
        body.setNextKinematicTranslation(stagingPos);
      }
      body.setNextKinematicRotation(targetQ);
    }
  });

  const scale = dieScale(sides);
  const half = (spec.cuboidHalf ?? [0.5, 0.5, 0.5]).map((v) => v * scale) as [
    number,
    number,
    number,
  ];

  // Lock mass frame to the geometric origin so asymmetric hulls (d4) spin about center.
  const centeredMass = {
    mass: 1,
    centerOfMass: { x: 0, y: 0, z: 0 },
    principalAngularInertia: { x: 0.045, y: 0.045, z: 0.045 },
    angularInertiaLocalFrame: { x: 0, y: 0, z: 0, w: 1 },
  };

  return (
    <RigidBody
      ref={(body) => {
        bodyRef.current = body;
        registerBody(id, body);
      }}
      colliders={false}
      position={[stagingPos.x, stagingPos.y, stagingPos.z]}
      friction={0.7}
      restitution={0.28}
      linearDamping={0.35}
      angularDamping={0.4}
    >
      {spec.collider === 'cuboid' ? (
        <CuboidCollider args={half} massProperties={centeredMass} />
      ) : (
        <ConvexHullCollider args={[hullPoints]} massProperties={centeredMass} />
      )}
      <group
        onPointerDown={(e) => {
          if (phase !== 'staging' && phase !== 'staged') return;
          e.stopPropagation();
          // Scene owns the drag session (window listeners) until mouse-up —
          // cursor does not need to stay over a die.
          onHoverDragPointerDown(id, e.pointerId, e.clientX, e.clientY);
        }}
      >
        <DieVisual
          sides={sides}
          scale={scale}
          showLabels
          value={value}
        />
      </group>
    </RigidBody>
  );
}

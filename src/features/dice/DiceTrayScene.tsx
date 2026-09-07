import { useFrame, useThree } from '@react-three/fiber';
import { Physics, RigidBody, CuboidCollider, ConvexHullCollider, type RapierRigidBody } from '@react-three/rapier';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PerspectiveCamera, Quaternion, type Texture, Vector3 } from 'three';
import { computePresentLayout } from './presentLayout';
import { PhysicsDie } from './PhysicsDie';
import { useDicePoolStore } from './dicePoolStore';
import {
  DEFAULT_TRAY_SIZE,
  traySizeFromAspect,
  type TraySize,
} from './trayLayout';
import { createFeltTexture, createWoodTexture } from './trayTextures';
import {
  DICE_SIDES,
  HOVER_Y,
  TRAY_WALL_H,
  TRAY_WALL_T,
} from './diceTypes';
import {
  clientPointOnHoverPlane,
  DRAG_GAIN,
  hoverDragMotion,
  pointerOutsideWindow,
  resetHoverDragMotion,
  softPlanarVelocity,
  softSpinRate,
  THROW_SPEED_SCALE,
} from './hoverDrag';
import { getDieMeshSpec } from './diceMeshes';
import { getDieHullPoints, warmDiceGpuAssets } from './dicePreload';
import { readDieResult } from './faceRead';

/** If any die never settles, force-complete the roll after this long. */
const ROLL_FORCE_COMPLETE_MS = 10_000;

/** Upload textures / compile face shaders on the tray GL context once. */
function DiceGpuWarmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const done = useRef(false);

  useLayoutEffect(() => {
    if (done.current) return;
    done.current = true;
    warmDiceGpuAssets(gl, scene, camera);
  }, [camera, gl, scene]);

  return null;
}

/**
 * Cook Rapier convex hulls off-tray so the first spawn does not hitch on collider build.
 * Fixed bodies far below the play area; removed after one frame is unnecessary — keep cheap.
 */
function DiceColliderWarmup() {
  return (
    <>
      {DICE_SIDES.map((sides) => {
        const spec = getDieMeshSpec(sides);
        if (spec.collider === 'cuboid') return null;
        const pts = getDieHullPoints(sides, 1);
        return (
          <RigidBody
            key={`warm-hull-${sides}`}
            type="fixed"
            colliders={false}
            position={[0, -80, 0]}
          >
            <ConvexHullCollider args={[pts]} />
          </RigidBody>
        );
      })}
    </>
  );
}

function useTrayTextures() {
  const textures = useMemo(() => {
    const felt = createFeltTexture();
    const wood = createWoodTexture();
    return { felt, wood };
  }, []);
  useEffect(
    () => () => {
      textures.felt.dispose();
      textures.wood.dispose();
    },
    [textures],
  );
  return textures;
}

function mappedClone(tex: Texture, repeatX: number, repeatY: number): Texture {
  const t = tex.clone();
  t.needsUpdate = true;
  // Integer repeats keep seams from landing mid-face when the map tiles.
  t.repeat.set(
    Math.max(1, Math.round(repeatX)),
    Math.max(1, Math.round(repeatY)),
  );
  return t;
}

function TrayBounds({
  halfW,
  halfD,
  felt,
  wood,
}: TraySize & { felt: Texture; wood: Texture }) {
  const wallT = TRAY_WALL_T;
  const wallY = TRAY_WALL_H / 2;

  const maps = useMemo(() => {
    const feltMap = mappedClone(felt, halfW * 2.2, halfD * 2.2);
    const wallNS = mappedClone(wood, halfW * 0.9, TRAY_WALL_H * 1.2);
    const wallEW = mappedClone(wood, halfD * 0.9, TRAY_WALL_H * 1.2);
    return {
      feltMap,
      wallNS,
      wallEW,
      dispose: () => {
        feltMap.dispose();
        wallNS.dispose();
        wallEW.dispose();
      },
    };
  }, [felt, wood, halfW, halfD]);

  useEffect(() => () => maps.dispose(), [maps]);

  return (
    <>
      <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
        {/* Physics top aligns with felt visual at y=0 */}
        <CuboidCollider args={[halfW, 0.08, halfD]} position={[0, -0.08, 0]} />
        {/* Full green felt floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[halfW * 2, halfD * 2]} />
          <meshStandardMaterial
            map={maps.feltMap}
            color="#3cb371"
            roughness={0.97}
            metalness={0}
          />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        {/* Wall colliders match the visible wood rim only */}
        <CuboidCollider args={[halfW + wallT, wallY, wallT]} position={[0, wallY, -halfD]} />
        <CuboidCollider args={[halfW + wallT, wallY, wallT]} position={[0, wallY, halfD]} />
        <CuboidCollider args={[wallT, wallY, halfD + wallT]} position={[-halfW, wallY, 0]} />
        <CuboidCollider args={[wallT, wallY, halfD + wallT]} position={[halfW, wallY, 0]} />
        <mesh castShadow receiveShadow position={[0, wallY, -halfD]}>
          <boxGeometry args={[halfW * 2, TRAY_WALL_H, wallT * 2]} />
          <meshStandardMaterial
            map={maps.wallNS}
            color="#c4a574"
            roughness={0.72}
            metalness={0.04}
          />
        </mesh>
        <mesh castShadow receiveShadow position={[0, wallY, halfD]}>
          <boxGeometry args={[halfW * 2, TRAY_WALL_H, wallT * 2]} />
          <meshStandardMaterial
            map={maps.wallNS}
            color="#c4a574"
            roughness={0.72}
            metalness={0.04}
          />
        </mesh>
        <mesh castShadow receiveShadow position={[-halfW, wallY, 0]}>
          <boxGeometry args={[wallT * 2, TRAY_WALL_H, halfD * 2]} />
          <meshStandardMaterial
            map={maps.wallEW}
            color="#c4a574"
            roughness={0.72}
            metalness={0.04}
          />
        </mesh>
        <mesh castShadow receiveShadow position={[halfW, wallY, 0]}>
          <boxGeometry args={[wallT * 2, TRAY_WALL_H, halfD * 2]} />
          <meshStandardMaterial
            map={maps.wallEW}
            color="#c4a574"
            roughness={0.72}
            metalness={0.04}
          />
        </mesh>
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, HOVER_Y - 0.2, 0]}>
        <planeGeometry args={[halfW * 2 - 0.3, halfD * 2 - 0.3]} />
        <meshStandardMaterial
          color="#64748b"
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

/** Keep the perspective camera framed on the current tray so it fills the panel. */
function TrayCameraFramer({ halfW, halfD }: TraySize) {
  const { camera, size } = useThree();

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const aspect = size.width / Math.max(1, size.height);
    camera.aspect = aspect;

    const vFov = (camera.fov * Math.PI) / 180;
    const halfV = Math.tan(vFov / 2);
    const halfH = halfV * aspect;
    const margin = 1.08;
    // Conservative distance so both tray axes fit at the look-at plane.
    const dist = Math.max((halfW * margin) / halfH, (halfD * margin) / halfV, 4.5);
    // Just short of top-down (~12° off vertical) so the full tray reads clearly.
    const pitch = Math.PI / 2 - 0.21;
    camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.near = 0.1;
    camera.far = Math.max(40, dist * 4);
    camera.lookAt(0, 0.05, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, halfW, halfD]);

  return null;
}

function useTraySize(): TraySize {
  const size = useThree((s) => s.size);
  return useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    if (!Number.isFinite(aspect) || aspect <= 0) return DEFAULT_TRAY_SIZE;
    return traySizeFromAspect(aspect);
  }, [size.width, size.height]);
}

export function DiceTrayScene() {
  const dice = useDicePoolStore((s) => s.dice);
  const rollPhase = useDicePoolStore((s) => s.rollPhase);
  const rollId = useDicePoolStore((s) => s.rollId);
  const flings = useDicePoolStore((s) => s.flings);
  const settleOrder = useDicePoolStore((s) => s.settleOrder);
  const beginRoll = useDicePoolStore((s) => s.beginRoll);
  const applySettledValues = useDicePoolStore((s) => s.applySettledValues);
  const markPresented = useDicePoolStore((s) => s.markPresented);
  const setDiePhase = useDicePoolStore((s) => s.setDiePhase);

  const tray = useTraySize();
  const { felt, wood } = useTrayTextures();
  const presentStarted = useRef(false);
  const settleOrderAcc = useRef<string[]>([]);
  const bodiesRef = useRef(new Map<string, RapierRigidBody>());
  const [hoverPhysics, setHoverPhysics] = useState(false);
  const dragSession = useRef<{
    pointerId: number;
    last: { x: number; z: number; t: number };
    cursor: { x: number; z: number };
    /** Accumulated cursor path length on the hover plane (ramps attraction). */
    dragPath: number;
    /** Fastest recent cursor planar velocity (survives a pause before release). */
    throwPeak: { vx: number; vz: number; speed: number; t: number };
    /** Last meaningful cursor velocity — release aim for peak gating. */
    aimVel: { vx: number; vz: number; speed: number };
    /** Previous cursor planar velocity for heading-rate (swirl) spin. */
    lastVel: { vx: number; vz: number } | null;
    /** Smoothed cursor heading rate (rad/s). */
    spinY: number;
  } | null>(null);
  const { camera, gl, invalidate } = useThree();
  const canvasEl = gl.domElement;

  const ORGANIZE_TOTAL_SEC = 1.5;
  /** Matches PhysicsDie present lerp rate (dt * 1.6 ⇒ ~0.625s). */
  const PRESENT_FLIGHT_SEC = 1 / 1.6;

  useEffect(() => {
    invalidate();
  }, [dice, rollPhase, tray.halfW, tray.halfD, invalidate]);

  useEffect(() => {
    if (rollPhase === 'rolling') {
      settleOrderAcc.current = [];
      setHoverPhysics(false);
      dragSession.current = null;
    }
  }, [rollPhase, rollId]);

  // Safety net: never leave a roll hanging if a die fails to settle.
  useEffect(() => {
    if (rollPhase !== 'rolling') return;
    const timer = window.setTimeout(() => {
      const state = useDicePoolStore.getState();
      if (state.rollPhase !== 'rolling') return;

      const values: Record<string, number> = {};
      const order = [...settleOrderAcc.current];
      for (const d of state.dice) {
        if (d.phase !== 'falling' && d.phase !== 'settled') continue;
        if (d.value != null) {
          values[d.id] = d.value;
          if (!order.includes(d.id)) order.push(d.id);
          continue;
        }
        const body = bodiesRef.current.get(d.id);
        let value = 1;
        if (body) {
          const r = body.rotation();
          const q = new Quaternion(r.x, r.y, r.z, r.w).normalize();
          value = readDieResult(
            getDieMeshSpec(d.sides).faces,
            q,
            getDieMeshSpec(d.sides).vertices,
          );
          body.setBodyType(RigidBodyType.Fixed, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        } else {
          value = 1 + Math.floor(Math.random() * d.sides);
        }
        values[d.id] = value;
        if (!order.includes(d.id)) order.push(d.id);
      }
      if (Object.keys(values).length === 0) return;
      applySettledValues(values, order);
    }, ROLL_FORCE_COMPLETE_MS);
    return () => window.clearTimeout(timer);
  }, [rollPhase, rollId, applySettledValues]);

  const registerBody = useCallback((id: string, body: RapierRigidBody | null) => {
    if (body) bodiesRef.current.set(id, body);
    else bodiesRef.current.delete(id);
  }, []);

  const armHoverBodies = useCallback(() => {
    const state = useDicePoolStore.getState();
    for (const d of state.dice) {
      if (d.phase !== 'staging' && d.phase !== 'staged') continue;
      const body = bodiesRef.current.get(d.id);
      if (!body) continue;
      body.setBodyType(RigidBodyType.Dynamic, true);
      body.setGravityScale(0, true);
      const t = body.translation();
      body.setTranslation({ x: t.x, y: HOVER_Y, z: t.z }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.wakeUp();
    }
    hoverDragMotion.active = true;
    setHoverPhysics(true);
  }, []);

  /** All dice take the same planar velocity as the cursor delta (no distance falloff). */
  const applyHoverDragMove = useCallback(
    (delta: { x: number; z: number }, dt: number) => {
      const frameDt = Math.max(0.008, dt);
      const vx = delta.x / frameDt;
      const vz = delta.z / frameDt;
      hoverDragMotion.vx = vx;
      hoverDragMotion.vz = vz;
      // Follow + spin are applied every frame (spring / ball-roll). Avoid hard
      // setLinvel here — it made dice slide parallel to the cursor until stop.
      return { vx, vz };
    },
    [],
  );

  const finishHoverDrag = useCallback(() => {
    const session = dragSession.current;
    if (!session) return;
    // Snapshot before clearing — hover damp often zeros linvel if the cursor paused.
    const peak = session.throwPeak;
    const aim = session.aimVel;
    const releaseSpinY = softSpinRate(session.spinY) * THROW_SPEED_SCALE;
    const now = performance.now();
    dragSession.current = null;
    resetHoverDragMotion();

    // Keep peak throw for a short pause after the swing (ms).
    const PEAK_TTL_MS = 450;
    const PEAK_ALIGN_COS = Math.cos((35 * Math.PI) / 180);
    const peakAlive = peak.speed > 0.5 && now - peak.t <= PEAK_TTL_MS;
    const aimSpeed = aim.speed;
    // Only reuse peak if it points within 35° of the last meaningful cursor aim.
    const peakAligned =
      peakAlive &&
      aimSpeed > 0.5 &&
      (peak.vx * aim.vx + peak.vz * aim.vz) / (peak.speed * aimSpeed) >= PEAK_ALIGN_COS;

    const state = useDicePoolStore.getState();
    const nextFlings: Record<string, { x: number; y: number; z: number; wy?: number }> = {};
    for (const d of state.dice) {
      if (d.phase !== 'staging' && d.phase !== 'staged') continue;
      const body = bodiesRef.current.get(d.id);
      if (body) {
        body.setGravityScale(1, true);
        const lv = body.linvel();
        let x = lv.x;
        let z = lv.z;
        // Prefer aim direction when linvel has been hover-damped away.
        if (aimSpeed > Math.hypot(x, z)) {
          x = aim.vx;
          z = aim.vz;
        }
        if (peakAligned && peak.speed > Math.hypot(x, z)) {
          x = peak.vx;
          z = peak.vz;
        }
        if (Math.hypot(x, z) < 1.2) {
          x += (Math.random() - 0.5) * 3;
          z += (Math.random() - 0.5) * 3;
        }
        // No hard speed ceiling — high throws taper via soft falloff.
        const throwXZ = softPlanarVelocity(x, z);
        nextFlings[d.id] = {
          x: throwXZ.vx,
          y: Math.min(lv.y, -3.0) - 0.8 - Math.random() * 0.9,
          z: throwXZ.vz,
          wy: releaseSpinY,
        };
      } else {
        nextFlings[d.id] = {
          x: (Math.random() - 0.5) * 3,
          y: -3.6 - Math.random() * 1.2,
          z: (Math.random() - 0.5) * 3,
          wy: releaseSpinY,
        };
      }
    }
    setHoverPhysics(false);
    beginRoll(nextFlings);
  }, [beginRoll]);

  const onHoverDragPointerDown = useCallback(
    (_id: string, pointerId: number, clientX: number, clientY: number) => {
      if (dragSession.current) return;
      const hit = clientPointOnHoverPlane(clientX, clientY, camera, canvasEl);
      if (!hit) return;
      dragSession.current = {
        pointerId,
        last: { x: hit.x, z: hit.z, t: performance.now() },
        cursor: { x: hit.x, z: hit.z },
        dragPath: 0,
        throwPeak: { vx: 0, vz: 0, speed: 0, t: 0 },
        aimVel: { vx: 0, vz: 0, speed: 0 },
        lastVel: null,
        spinY: 0,
      };
      resetHoverDragMotion();
      armHoverBodies();
    },
    [armHoverBodies, camera, canvasEl],
  );

  // Spring toward cursor + match cursor planar velocity (runs every frame while grabbing).
  useFrame((_, dt) => {
    const session = dragSession.current;
    if (!session || !hoverDragMotion.active) return;
    const state = useDicePoolStore.getState();
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    const attractK = 2.4 + Math.min(18, session.dragPath * 3.2);
    const velMatchK = 10;
    const { x: cx, z: cz } = session.cursor;

    // If the pointer went quiet, bleed off cursor velocity so dice can settle to the cursor.
    const idleMs = performance.now() - session.last.t;
    if (idleMs > 40) {
      const decay = Math.exp(-10 * clampedDt);
      hoverDragMotion.vx *= decay;
      hoverDragMotion.vz *= decay;
      session.spinY *= decay;
      hoverDragMotion.spinY = session.spinY;
    }

    for (const d of state.dice) {
      if (d.phase !== 'staging' && d.phase !== 'staged') continue;
      const body = bodiesRef.current.get(d.id);
      if (!body) continue;
      const t = body.translation();
      const lv = body.linvel();
      const dx = cx - t.x;
      const dz = cz - t.z;
      const mass = Math.max(0.15, body.mass());
      body.applyImpulse(
        {
          x: (dx * attractK + (hoverDragMotion.vx - lv.x) * velMatchK) * mass * clampedDt,
          y: 0,
          z: (dz * attractK + (hoverDragMotion.vz - lv.z) * velMatchK) * mass * clampedDt,
        },
        true,
      );
      body.wakeUp();
    }
  });

  // Window-level tracking: keep moving dice until mouse-up, even off the canvas / off dice.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const session = dragSession.current;
      if (!session || e.pointerId !== session.pointerId) return;

      // Mouse released without a pointerup (e.g. outside window) — drop.
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
        finishHoverDrag();
        return;
      }
      if (pointerOutsideWindow(e)) {
        finishHoverDrag();
        return;
      }

      const hit = clientPointOnHoverPlane(e.clientX, e.clientY, camera, canvasEl);
      if (!hit) return;
      session.cursor = { x: hit.x, z: hit.z };
      const now = performance.now();
      const frameDt = Math.max(0.008, (now - session.last.t) / 1000);
      const stepX = hit.x - session.last.x;
      const stepZ = hit.z - session.last.z;
      session.dragPath += Math.hypot(stepX, stepZ);
      const dx = stepX * DRAG_GAIN;
      const dz = stepZ * DRAG_GAIN;
      const { vx, vz } = applyHoverDragMove({ x: dx, z: dz }, frameDt);
      const speed = Math.hypot(vx, vz);
      // Ignore near-zero jitter so a pause doesn't wipe the swing peak.
      if (speed > 1.25 && speed >= session.throwPeak.speed) {
        session.throwPeak = { vx, vz, speed, t: now };
      } else if (speed > 2.5 && speed > session.throwPeak.speed * 0.65) {
        // Still moving meaningfully — keep the peak "fresh".
        session.throwPeak.t = now;
      }
      // Last solid cursor heading — peak may only reuse if within 35° of this.
      if (speed > 1.25) {
        session.aimVel = { vx, vz, speed };
      }

      // Circling: heading change of the cursor velocity → Y spin on the dice.
      if (session.lastVel && speed > 1.0) {
        const a0 = Math.atan2(session.lastVel.vz, session.lastVel.vx);
        const a1 = Math.atan2(vz, vx);
        let da = a1 - a0;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        const wy = da / frameDt;
        session.spinY = softSpinRate(session.spinY * 0.72 + wy * 0.28);
      } else if (speed < 0.6) {
        session.spinY *= 0.88;
      }
      hoverDragMotion.spinY = session.spinY;
      session.lastVel = { vx, vz };

      session.last = { x: hit.x, z: hit.z, t: now };
    };

    const onUp = (e: PointerEvent) => {
      const session = dragSession.current;
      if (!session || e.pointerId !== session.pointerId) return;
      finishHoverDrag();
    };

    const onBlur = () => {
      if (dragSession.current) finishHoverDrag();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && dragSession.current) {
        finishHoverDrag();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [applyHoverDragMove, camera, canvasEl, finishHoverDrag]);

  const presentSlots = useMemo(() => {
    // Reveal formation only while a completed roll is on display.
    // If any new die is staging, regroup everyone onto the spawn cluster.
    if (rollPhase === 'rolling') {
      return new Map<string, { x: number; z: number }>();
    }
    if (dice.some((d) => d.phase === 'staging')) {
      return new Map<string, { x: number; z: number }>();
    }
    const ready = dice.filter((d) => d.value != null) as Array<{
      id: string;
      sides: (typeof dice)[number]['sides'];
      value: number;
    }>;
    if (ready.length === 0) return new Map<string, { x: number; z: number }>();
    const layout = computePresentLayout(
      ready.map((d) => ({ id: d.id, sides: d.sides, value: d.value })),
      tray.halfW,
      tray.halfD,
    );
    return new Map(layout.map((s) => [s.id, { x: s.x, z: s.z }]));
  }, [dice, tray.halfW, tray.halfD, rollPhase]);

  /** Delay between successive settle-order flights so the last lands at 1.5s. */
  const presentStaggerSec = useMemo(() => {
    const n = Math.max(1, settleOrder.length || dice.filter((d) => d.value != null).length);
    if (n <= 1) return 0;
    return Math.max(0, (ORGANIZE_TOTAL_SEC - PRESENT_FLIGHT_SEC) / (n - 1));
  }, [settleOrder.length, dice]);

  useEffect(() => {
    if (rollPhase !== 'presenting') {
      presentStarted.current = false;
      return;
    }
    if (presentStarted.current) return;
    presentStarted.current = true;
    const t = window.setTimeout(() => {
      markPresented();
    }, ORGANIZE_TOTAL_SEC * 1000);
    return () => clearTimeout(t);
  }, [rollPhase, markPresented]);

  const onSettled = (id: string, value: number) => {
    if (!settleOrderAcc.current.includes(id)) {
      settleOrderAcc.current.push(id);
    }
    setDiePhase(id, 'settled', value);
    queueMicrotask(() => {
      const state = useDicePoolStore.getState();
      if (state.rollPhase !== 'rolling') return;
      const active = state.dice.filter(
        (d) => d.phase === 'falling' || d.phase === 'settled',
      );
      if (active.length === 0) return;
      if (!active.every((d) => d.value != null)) return;
      const values: Record<string, number> = {};
      for (const d of active) values[d.id] = d.value!;
      applySettledValues(values, [...settleOrderAcc.current]);
    });
  };

  return (
    <Physics gravity={[0, -18, 0]} timeStep="vary">
      <DiceGpuWarmup />
      <DiceColliderWarmup />
      <TrayCameraFramer halfW={tray.halfW} halfD={tray.halfD} />
      <TrayBounds
        key={`${tray.halfW.toFixed(3)}x${tray.halfD.toFixed(3)}`}
        halfW={tray.halfW}
        halfD={tray.halfD}
        felt={felt}
        wood={wood}
      />
      <ambientLight intensity={0.55} />
      <directionalLight
        castShadow
        position={[4, 8, 3]}
        intensity={1.25}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={['#94a3b8', '#0f172a', 0.35]} />
      {dice.map((die, i) => {
        const fling = flings[die.id];
        const settleIdx = settleOrder.indexOf(die.id);
        const presentDelaySec =
          settleIdx >= 0 ? settleIdx * presentStaggerSec : 0;
        return (
          <PhysicsDie
            key={die.id}
            id={die.id}
            sides={die.sides}
            phase={die.phase}
            value={die.value}
            spawnIndex={i}
            spawnCount={dice.length}
            trayHalfW={tray.halfW}
            trayHalfD={tray.halfD}
            presentTarget={presentSlots.get(die.id) ?? null}
            presentDelaySec={presentDelaySec}
            rollId={rollId}
            hoverPhysics={hoverPhysics}
            flingVelocity={
              fling ? new Vector3(fling.x, fling.y, fling.z) : null
            }
            flingSpinY={fling?.wy ?? 0}
            onSettled={onSettled}
            onHoverDragPointerDown={onHoverDragPointerDown}
            registerBody={registerBody}
          />
        );
      })}
    </Physics>
  );
}

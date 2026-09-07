import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import { Suspense, useEffect, useLayoutEffect } from 'react';
import { DICE_SIDES } from './diceTypes';
import { InteractiveShowcaseDie } from './InteractiveShowcaseDie';

type Props = {
  /** Pause rendering / simulation when the Dice settings tab is hidden. */
  active?: boolean;
  className?: string;
};

/** World units between die centers. */
const SPACING = 1.55;
/** Half-extent of one showcase die (scale × mesh AABB), plus hover lean slack. */
const CONTENT_HALF_H = 1.05;
const CONTENT_HALF_W =
  ((DICE_SIDES.length - 1) / 2) * SPACING + CONTENT_HALF_H;

function ShowcaseCamera() {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);

  useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    // Contain the full row: expand the frustum on the tighter axis.
    const halfH = Math.max(CONTENT_HALF_H, CONTENT_HALF_W / aspect);
    const halfW = halfH * aspect;
    const cam = camera as import('three').OrthographicCamera;
    if (!('isOrthographicCamera' in cam) || !cam.isOrthographicCamera) return;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.near = 0.1;
    cam.far = 40;
    cam.position.set(0, 0.15, 6);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return (
    <OrthographicCamera
      makeDefault
      position={[0, 0.15, 6]}
      near={0.1}
      far={40}
      // Initial; updated to contain the row in layout effect.
      left={-CONTENT_HALF_W}
      right={CONTENT_HALF_W}
      top={CONTENT_HALF_H}
      bottom={-CONTENT_HALF_H}
    />
  );
}

function ShowcaseScene({ active }: { active: boolean }) {
  return (
    <>
      <ShowcaseCamera />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 8, 3]} intensity={1.25} />
      <hemisphereLight args={['#94a3b8', '#0f172a', 0.35]} />
      {DICE_SIDES.map((sides, i) => {
        const x = (i - (DICE_SIDES.length - 1) / 2) * SPACING;
        return (
          <InteractiveShowcaseDie
            key={sides}
            sides={sides}
            position={[x, 0, 0]}
            active={active}
          />
        );
      })}
    </>
  );
}

/** Top-of-settings row of interactive polyset dice (transparent, tray lighting). */
export function DiceShowcaseRow({ active = true, className }: Props) {
  useEffect(() => {
    if (!active) return;
    void import('troika-three-text').then(({ preloadFont }) => {
      preloadFont({ characters: '0123456789' }, () => {});
    });
  }, [active]);

  return (
    <div className={className} aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        frameloop={active ? 'always' : 'never'}
        gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
        orthographic
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <ShowcaseScene active={active} />
        </Suspense>
      </Canvas>
    </div>
  );
}

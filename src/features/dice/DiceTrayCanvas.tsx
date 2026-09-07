import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { DiceTrayScene } from './DiceTrayScene';

type Props = {
  active: boolean;
};

/** Warm troika's default font so present labels don't suspend the tray. */
function preloadDieLabelFont() {
  void import('troika-three-text').then(({ preloadFont }) => {
    preloadFont({ characters: '0123456789' }, () => {});
  });
}

export function DiceTrayCanvas({ active }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Defer Rapier canvas until tab is shown at least once.
    if (active) {
      setReady(true);
      preloadDieLabelFont();
    }
  }, [active]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950/80 text-xs text-slate-500">
        Open Dice to load the tray
      </div>
    );
  }

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      frameloop={active ? 'always' : 'never'}
      gl={{ antialias: true, alpha: false }}
      camera={{ position: [0, 9.5, 2.0], fov: 34, near: 0.1, far: 80 }}
      style={{ width: '100%', height: '100%', background: '#0b1220' }}
    >
      <color attach="background" args={['#0b1220']} />
      <DiceTrayScene />
    </Canvas>
  );
}

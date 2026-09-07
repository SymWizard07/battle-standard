import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { DieVisual } from './DieVisual';
import { DIE_SCALE, dieScale, type DiceSides } from './diceTypes';

type Props = {
  sides: DiceSides;
  className?: string;
};

/** Tiny matching preview of a die for picker buttons. */
export function DiePreview({ sides, className }: Props) {
  const previewScale = (dieScale(sides) / DIE_SCALE) * 0.9;
  return (
    <div className={className} aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [1.4, 1.2, 1.6], fov: 35 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 2]} intensity={1.1} />
        <Suspense fallback={null}>
          <DieVisual sides={sides} scale={previewScale} showLabels />
        </Suspense>
      </Canvas>
    </div>
  );
}

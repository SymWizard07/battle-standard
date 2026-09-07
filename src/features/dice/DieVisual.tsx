import { useEffect, useMemo } from 'react';
import { BufferGeometry, EdgesGeometry } from 'three';
import { dieAccentColor, getDieMeshSpec } from './diceMeshes';
import { getDieFaceTextures } from './dieFaceTextures';
import type { DiceSides } from './diceTypes';
import { DIE_SCALE } from './diceTypes';

type Props = {
  sides: DiceSides;
  /** Show face value textures (albedo + engraved normal map). */
  showLabels?: boolean;
  /** Reserved for result highlight. */
  value?: number | null;
  scale?: number;
};

export function DieVisual({
  sides,
  showLabels = false,
  value: _value = null,
  scale = DIE_SCALE,
}: Props) {
  const spec = useMemo(() => getDieMeshSpec(sides), [sides]);
  const color = dieAccentColor(sides);
  const edges = useMemo(() => {
    // d10 ships a deduped outline so the equator isn't double-stroked.
    if (spec.outline) return spec.outline;
    return new EdgesGeometry(spec.geometry, 2);
  }, [spec.geometry, spec.outline]);

  useEffect(() => {
    // Only dispose geometries we created here (not the shared d10 outline).
    return () => {
      if (!spec.outline && edges instanceof BufferGeometry) {
        edges.dispose();
      }
    };
  }, [edges, spec.outline]);

  const faceTex = useMemo(
    () => (showLabels ? getDieFaceTextures(sides, color, spec.faces) : null),
    [showLabels, sides, color, spec.faces],
  );

  return (
    <group scale={scale}>
      <mesh geometry={spec.geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={faceTex ? '#ffffff' : color}
          map={faceTex?.map}
          normalMap={faceTex?.normalMap}
          normalScale={faceTex?.normalScale}
          roughness={0.42}
          metalness={0.06}
          flatShading
        />
      </mesh>
      <lineSegments geometry={edges} renderOrder={1}>
        <lineBasicMaterial
          color="#0b0f14"
          toneMapped={false}
          depthTest
          transparent={false}
        />
      </lineSegments>
    </group>
  );
}

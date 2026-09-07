import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferGeometry, EdgesGeometry, ShaderMaterial } from 'three';
import { dieAccentColor, getDieMeshSpec } from './diceMeshes';
import { useDieFaceShaderStore } from './dieFaceShaderStore';
import { getDieFaceTextures } from './dieFaceTextures';
import type { DiceSides } from './diceTypes';
import { DIE_SCALE } from './diceTypes';
import {
  FACE_SHADER_VERTEX,
  createFaceShaderUniforms,
  getStubAlbedoMap,
  getStubNormalMap,
  hexToFaceColor,
} from './faceShaderLib';

type Props = {
  sides: DiceSides;
  /** Show face value textures (albedo + engraved normal map). */
  showLabels?: boolean;
  /** Reserved for result highlight. */
  value?: number | null;
  scale?: number;
};

function DieFaceShaderMaterial({
  fragmentSource,
  albedoMap,
  normalMap,
  faceColorHex,
}: {
  fragmentSource: string;
  albedoMap: ReturnType<typeof getDieFaceTextures>['map'] | null;
  normalMap: ReturnType<typeof getDieFaceTextures>['normalMap'] | null;
  faceColorHex: string;
}) {
  // Stable per die instance for shader variation (phase, seeds, etc.).
  const uRandom = useMemo(() => Math.random(), []);
  const material = useMemo(() => {
    const mat = new ShaderMaterial({
      vertexShader: FACE_SHADER_VERTEX,
      fragmentShader: fragmentSource,
      uniforms: createFaceShaderUniforms(
        albedoMap ?? getStubAlbedoMap(),
        normalMap ?? getStubNormalMap(),
        faceColorHex,
        uRandom,
      ),
    });
    return mat;
  }, [fragmentSource, albedoMap, normalMap, faceColorHex, uRandom]);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    material.uniforms.uAlbedoMap!.value = albedoMap ?? getStubAlbedoMap();
    material.uniforms.uNormalMap!.value = normalMap ?? getStubNormalMap();
    material.uniforms.uFaceColor!.value.copy(hexToFaceColor(faceColorHex));
    material.uniforms.uRandom!.value = uRandom;
  }, [albedoMap, faceColorHex, material, normalMap, uRandom]);

  useFrame((state) => {
    material.uniforms.uTime!.value = state.clock.elapsedTime;
    material.uniforms.uResolution!.value.set(state.size.width, state.size.height);
  });

  return <primitive object={material} attach="material" />;
}

export function DieVisual({
  sides,
  showLabels = false,
  value: _value = null,
  scale = DIE_SCALE,
}: Props) {
  const spec = useMemo(() => getDieMeshSpec(sides), [sides]);
  const color = dieAccentColor(sides);
  const customFragment = useDieFaceShaderStore((s) => s.shaders[sides] ?? null);
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

  const needFaceTex = showLabels || customFragment != null;
  const faceTex = useMemo(
    () => (needFaceTex ? getDieFaceTextures(sides, color, spec.faces) : null),
    [needFaceTex, sides, color, spec.faces],
  );

  return (
    <group scale={scale}>
      <mesh geometry={spec.geometry} castShadow receiveShadow>
        {customFragment ? (
          <DieFaceShaderMaterial
            fragmentSource={customFragment}
            albedoMap={faceTex?.map ?? null}
            normalMap={faceTex?.normalMap ?? null}
            faceColorHex={color}
          />
        ) : (
          <meshStandardMaterial
            color={color}
            map={faceTex?.map}
            normalMap={faceTex?.normalMap}
            normalScale={faceTex?.normalScale}
            roughness={0.42}
            metalness={0.06}
            flatShading
          />
        )}
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

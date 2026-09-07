import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ShaderMaterial, type OrthographicCamera as OrthographicCameraType } from 'three';
import {
  FACE_SHADER_STARTER,
  FACE_SHADER_VERTEX,
  createFaceShaderUniforms,
  getPreviewGlyphMaps,
} from '../dice/faceShaderLib';

export { SHADER_PREVIEW_STARTER, SHADER_PREVIEW_VERTEX } from '../dice/faceShaderLib';

type PreviewSceneProps = {
  fragmentSource: string;
  active: boolean;
  onCompileResult?: (error: string | null) => void;
};

function PreviewQuad({ fragmentSource, active, onCompileResult }: PreviewSceneProps) {
  const { gl, scene, camera, size } = useThree();
  const lastGood = useRef(FACE_SHADER_STARTER);
  const material = useMemo(() => {
    const glyphs = getPreviewGlyphMaps();
    return new ShaderMaterial({
      vertexShader: FACE_SHADER_VERTEX,
      fragmentShader: FACE_SHADER_STARTER,
      uniforms: createFaceShaderUniforms(glyphs.albedo, glyphs.normal),
    });
  }, []);

  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    material.uniforms.uResolution!.value.set(size.width, size.height);
  }, [material, size.width, size.height]);

  useLayoutEffect(() => {
    const prevHandler = gl.debug.onShaderError;
    let compileError: string | null = null;

    gl.debug.onShaderError = (_ctx, _program, _vs, fs) => {
      const log = _ctx.getShaderInfoLog(fs)?.trim();
      compileError = log && log.length > 0 ? log : 'Fragment shader failed to compile.';
    };

    material.fragmentShader = fragmentSource;
    material.needsUpdate = true;
    gl.compile(scene, camera);

    gl.debug.onShaderError = prevHandler;

    if (compileError) {
      material.fragmentShader = lastGood.current;
      material.needsUpdate = true;
      gl.compile(scene, camera);
      onCompileResult?.(compileError);
      return;
    }

    lastGood.current = fragmentSource;
    onCompileResult?.(null);
  }, [camera, fragmentSource, gl, material, onCompileResult, scene]);

  useFrame((state) => {
    if (!active) return;
    material.uniforms.uTime!.value = state.clock.elapsedTime;
    material.uniforms.uResolution!.value.set(size.width, size.height);
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function LockOrthoFrustum() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useLayoutEffect(() => {
    const cam = camera as OrthographicCameraType;
    if (!('isOrthographicCamera' in cam) || !cam.isOrthographicCamera) return;
    cam.left = -1;
    cam.right = 1;
    cam.top = 1;
    cam.bottom = -1;
    cam.near = 0.1;
    cam.far = 10;
    cam.position.set(0, 0, 1);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return null;
}

type Props = {
  fragmentSource: string;
  active?: boolean;
  className?: string;
  onCompileResult?: (error: string | null) => void;
};

/** Live full-screen-quad preview of a fragment shader (uTime, uResolution, vUv). */
export function ShaderPreviewSquare({
  fragmentSource,
  active = true,
  className,
  onCompileResult,
}: Props) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        frameloop={active ? 'always' : 'never'}
        gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
        orthographic
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.debug.checkShaderErrors = true;
        }}
        style={{ width: '100%', height: '100%', background: 'transparent', pointerEvents: 'none' }}
      >
        <OrthographicCamera
          makeDefault
          position={[0, 0, 1]}
          near={0.1}
          far={10}
          left={-1}
          right={1}
          top={1}
          bottom={-1}
        />
        <LockOrthoFrustum />
        <PreviewQuad
          fragmentSource={fragmentSource}
          active={active}
          onCompileResult={onCompileResult}
        />
      </Canvas>
    </div>
  );
}

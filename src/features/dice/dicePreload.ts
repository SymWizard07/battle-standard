import { Group, Mesh, ShaderMaterial, type Camera, type Scene, type WebGLRenderer } from 'three';
import { dieAccentColor, getDieMeshSpec } from './diceMeshes';
import { useDieFaceShaderStore } from './dieFaceShaderStore';
import { getDieFaceTextures, getDieFaceTexturesFromLayout } from './dieFaceTextures';
import { defaultDieFaceGlyphLayout } from './dieFaceFonts';
import { DICE_SIDES, dieScale, FULL_SIZE_DICE_CAP, type DiceSides } from './diceTypes';
import {
  DEFAULT_DIE_FACE_SHADER,
  FACE_SHADER_VERTEX,
  createFaceShaderUniforms,
} from './faceShaderLib';

const hullCache = new Map<string, Float32Array>();

/** Unique scaled vertices for a convex hull matching the rendered die. */
export function getDieHullPoints(sides: DiceSides, poolCount: number): Float32Array {
  const scale = dieScale(sides, poolCount);
  const key = `${sides}:${scale.toFixed(5)}`;
  const hit = hullCache.get(key);
  if (hit) return hit;

  // Tiny inflate so the visual face sits on the felt instead of sinking through it.
  const s = scale * 1.02;
  const geometry = getDieMeshSpec(sides).geometry;
  const pos = geometry.getAttribute('position');
  const pts: number[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * s;
    const y = pos.getY(i) * s;
    const z = pos.getZ(i) * s;
    const k = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    pts.push(x, y, z);
  }
  const arr = new Float32Array(pts);
  hullCache.set(key, arr);
  return arr;
}

/** Build meshes, glyph atlases, and hull point caches on the CPU (idempotent). */
export function warmDiceCpuAssets() {
  for (const sides of DICE_SIDES) {
    const spec = getDieMeshSpec(sides);
    getDieFaceTextures(sides, dieAccentColor(sides), spec.faces);
    getDieHullPoints(sides, 1);
    getDieHullPoints(sides, FULL_SIZE_DICE_CAP + 1);
  }
}

/**
 * Upload face atlases and compile face ShaderMaterials on the tray's GL context
 * so the first real die does not hitch on texture upload / program link.
 */
export function warmDiceGpuAssets(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
) {
  warmDiceCpuAssets();
  const shaders = useDieFaceShaderStore.getState().shaders;
  const group = new Group();
  group.visible = false;
  const temps: ShaderMaterial[] = [];

  for (const sides of DICE_SIDES) {
    const spec = getDieMeshSpec(sides);
    const color = dieAccentColor(sides);
    const layout = defaultDieFaceGlyphLayout(
      useDieFaceShaderStore.getState().layouts[sides],
    );
    const tex = getDieFaceTexturesFromLayout(sides, color, spec.faces, layout);
    const fragment = shaders[sides] ?? DEFAULT_DIE_FACE_SHADER;
    const mat = new ShaderMaterial({
      vertexShader: FACE_SHADER_VERTEX,
      fragmentShader: fragment,
      uniforms: createFaceShaderUniforms(tex.map, tex.normalMap, color),
    });
    temps.push(mat);
    const mesh = new Mesh(spec.geometry, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  scene.add(group);
  try {
    gl.compile(scene, camera);
    // Force texture uploads / mip generation on this context.
    for (const sides of DICE_SIDES) {
      const color = dieAccentColor(sides);
      const layout = defaultDieFaceGlyphLayout(
        useDieFaceShaderStore.getState().layouts[sides],
      );
      const tex = getDieFaceTexturesFromLayout(
        sides,
        color,
        getDieMeshSpec(sides).faces,
        layout,
      );
      gl.initTexture(tex.map);
      gl.initTexture(tex.normalMap);
    }
  } finally {
    scene.remove(group);
    for (const mat of temps) mat.dispose();
  }
}

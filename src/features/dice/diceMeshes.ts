import {
  BoxGeometry,
  BufferGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  OctahedronGeometry,
  TetrahedronGeometry,
  Vector3,
} from 'three';
import type { DiceSides } from './diceTypes';
import type { FaceDef, VertexMark } from './faceRead';
import { dieAtlasGrid } from './dieFaceTextures';

function alignFromFaceVerts(
  normal: Vector3,
  verts: Vector3[],
): [number, number, number] {
  const mid = new Vector3();
  for (const v of verts) mid.add(v);
  if (verts.length > 0) mid.multiplyScalar(1 / verts.length);

  let best = verts[0] ?? new Vector3(1, 0, 0);
  let bestScore = -Infinity;
  for (const v of verts) {
    // Prefer a vertex of the face; break ties so the choice is stable.
    const score = v.distanceToSquared(mid) * 1e3 + v.z * 10 + v.x;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }

  const align = new Vector3().subVectors(best, mid);
  align.addScaledVector(normal, -align.dot(normal));
  if (align.lengthSq() < 1e-10) {
    const ref = Math.abs(normal.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
    align.crossVectors(normal, ref).normalize();
  } else {
    align.normalize();
  }
  return [align.x, align.y, align.z];
}

/** Unique-vertex centroid of a position buffer. */
function uniqueVertexCentroid(geometry: BufferGeometry): Vector3 {
  const pos = geometry.getAttribute('position');
  const seen = new Set<string>();
  const acc = new Vector3();
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    acc.x += x;
    acc.y += y;
    acc.z += z;
    n += 1;
  }
  if (n > 0) acc.multiplyScalar(1 / n);
  return acc;
}

/**
 * Center at the origin and scale so the longest AABB side is 1.
 * Better matches a physical set's "same size in the hand" than equal circumradius.
 */
function fitUnitMaxExtent(
  geometry: BufferGeometry,
  outline?: BufferGeometry,
): { offset: Vector3; scale: number } {
  const offset = uniqueVertexCentroid(geometry);
  if (offset.lengthSq() > 1e-14) {
    geometry.translate(-offset.x, -offset.y, -offset.z);
    outline?.translate(-offset.x, -offset.y, -offset.z);
  }
  geometry.computeBoundingBox();
  const size = new Vector3();
  geometry.boundingBox!.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 1e-8);
  const scale = 1 / maxDim;
  geometry.scale(scale, scale, scale);
  outline?.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  return { offset, scale };
}

function remapFaceCenters(
  faces: FaceDef[],
  offset: Vector3,
  scale: number,
): void {
  for (const f of faces) {
    if (!f.center) continue;
    f.center = [
      (f.center[0] - offset.x) * scale,
      (f.center[1] - offset.y) * scale,
      (f.center[2] - offset.z) * scale,
    ];
  }
}

function faceCentroid(verts: Vector3[]): [number, number, number] {
  const seen = new Set<string>();
  const acc = new Vector3();
  let n = 0;
  for (const v of verts) {
    const key = `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    acc.add(v);
    n += 1;
  }
  if (n > 0) acc.multiplyScalar(1 / n);
  return [acc.x, acc.y, acc.z];
}

function facesFromUniqueNormals(
  geometry: BufferGeometry,
  valueForIndex: (i: number, normal: Vector3) => number,
): FaceDef[] {
  geometry.computeVertexNormals();
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const groups: { normal: Vector3; verts: Vector3[] }[] = [];

  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  const n = new Vector3();

  const triCount = index ? index.count / 3 : pos.count / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac).normalize();
    if (n.lengthSq() < 1e-8) continue;

    let group = groups.find((g) => g.normal.dot(n) > 0.92);
    if (!group) {
      group = { normal: n.clone(), verts: [] };
      groups.push(group);
    }
    group.verts.push(a.clone(), b.clone(), c.clone());
  }

  return groups.map((g, i) => ({
    normal: [g.normal.x, g.normal.y, g.normal.z] as [number, number, number],
    value: valueForIndex(i, g.normal),
    align: alignFromFaceVerts(g.normal, g.verts),
    center: faceCentroid(g.verts),
  }));
}

/** Standard d6: opposites sum to 7. Glyph-up is axis-aligned to the face edges. */
function d6Faces(he: number): FaceDef[] {
  return [
    { normal: [0, 1, 0], value: 1, align: [0, 0, -1], center: [0, he, 0] },
    { normal: [0, -1, 0], value: 6, align: [0, 0, 1], center: [0, -he, 0] },
    { normal: [1, 0, 0], value: 2, align: [0, 1, 0], center: [he, 0, 0] },
    { normal: [-1, 0, 0], value: 5, align: [0, 1, 0], center: [-he, 0, 0] },
    { normal: [0, 0, 1], value: 3, align: [0, 1, 0], center: [0, 0, he] },
    { normal: [0, 0, -1], value: 4, align: [0, 1, 0], center: [0, 0, -he] },
  ];
}

/**
 * Number faces so opposite normals form pairs that sum to `pairSum`
 * (d8→9, d10→11, d12→13, d20→21). Standard polyhedral fairness convention.
 */
function assignOppositeSum(faces: FaceDef[], pairSum: number): FaceDef[] {
  const remaining = faces.map((f, i) => ({ f, i }));
  const pairs: Array<[FaceDef, FaceDef]> = [];

  while (remaining.length >= 2) {
    const a = remaining[0]!.f;
    const na = new Vector3(a.normal[0], a.normal[1], a.normal[2]);
    let bestJ = 1;
    let bestDot = Infinity;
    for (let j = 1; j < remaining.length; j++) {
      const o = remaining[j]!.f;
      const d = na.dot(new Vector3(o.normal[0], o.normal[1], o.normal[2]));
      if (d < bestDot) {
        bestDot = d;
        bestJ = j;
      }
    }
    const b = remaining[bestJ]!.f;
    remaining.splice(bestJ, 1);
    remaining.shift();
    // Stable: face with higher +Y gets the lower number in the pair.
    if (a.normal[1] > b.normal[1] + 1e-9) pairs.push([a, b]);
    else if (b.normal[1] > a.normal[1] + 1e-9) pairs.push([b, a]);
    else if (a.normal[0] <= b.normal[0]) pairs.push([a, b]);
    else pairs.push([b, a]);
  }

  pairs.sort((p, q) => {
    const dy = q[0].normal[1] - p[0].normal[1];
    if (Math.abs(dy) > 1e-9) return dy;
    const dx = p[0].normal[0] - q[0].normal[0];
    if (Math.abs(dx) > 1e-9) return dx;
    return p[0].normal[2] - q[0].normal[2];
  });

  let lo = 1;
  for (const [lowFace, highFace] of pairs) {
    lowFace.value = lo;
    highFace.value = pairSum - lo;
    lo += 1;
  }
  return faces;
}

/** Unique verts of a mesh, stably ordered for numbering. */
function extractUniqueVertices(geometry: BufferGeometry): Vector3[] {
  const pos = geometry.getAttribute('position');
  const seen = new Set<string>();
  const verts: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    verts.push(new Vector3(x, y, z));
  }
  verts.sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
  return verts;
}

function nearestVertexIndex(verts: Vector3[], p: Vector3): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < verts.length; i++) {
    const d = verts[i]!.distanceToSquared(p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * d4: vertices numbered 1–4. Each face shows the three corner vertex numbers
 * (repeated across faces), rotated toward each corner. Face.value = opposite
 * vertex (the result when that face is down / that vertex is up).
 */
function buildD4Faces(geometry: BufferGeometry): {
  faces: FaceDef[];
  vertices: VertexMark[];
} {
  const verts = extractUniqueVertices(geometry);
  while (verts.length < 4) verts.push(new Vector3());
  const vertices: VertexMark[] = verts.slice(0, 4).map((v, i) => ({
    value: i + 1,
    position: [v.x, v.y, v.z],
  }));

  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const faceKeys = new Map<string, { normal: Vector3; corners: number[] }>();

  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  const n = new Vector3();

  const triCount = index ? index.count / 3 : pos.count / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac).normalize();
    if (n.lengthSq() < 1e-8) continue;

    const c0 = nearestVertexIndex(verts, a);
    const c1 = nearestVertexIndex(verts, b);
    const c2 = nearestVertexIndex(verts, c);
    const corners = [c0, c1, c2].sort((x, y) => x - y);
    const key = corners.join(',');
    const existing = faceKeys.get(key);
    if (!existing) {
      faceKeys.set(key, { normal: n.clone(), corners: [c0, c1, c2] });
    }
  }

  const faces: FaceDef[] = [];
  for (const { normal, corners } of faceKeys.values()) {
    const uniq = [...new Set(corners)];
    if (uniq.length < 3) continue;
    const mid = new Vector3();
    for (const ci of uniq) mid.add(verts[ci]!);
    mid.multiplyScalar(1 / uniq.length);
    if (normal.dot(mid) < 0) normal.negate();

    // Opposite vertex = the one not on this face; that is the result when face is down.
    const onFace = new Set(uniq);
    let opposite = 0;
    for (let i = 0; i < 4; i++) {
      if (!onFace.has(i)) {
        opposite = i;
        break;
      }
    }

    const cornerLabels = uniq.map((ci) => {
      const v = verts[ci]!;
      const toward = new Vector3().subVectors(v, mid);
      toward.addScaledVector(normal, -toward.dot(normal));
      if (toward.lengthSq() < 1e-10) {
        toward.set(1, 0, 0);
        toward.addScaledVector(normal, -toward.dot(normal)).normalize();
      } else {
        toward.normalize();
      }
      // Pull label toward the corner, slightly off the surface along the normal.
      const p = mid.clone().lerp(v, 0.62).addScaledVector(normal, 0.045);
      return {
        value: ci + 1,
        position: [p.x, p.y, p.z] as [number, number, number],
        align: [toward.x, toward.y, toward.z] as [number, number, number],
      };
    });

    faces.push({
      normal: [normal.x, normal.y, normal.z],
      value: opposite + 1,
      align: alignFromFaceVerts(normal, uniq.map((ci) => verts[ci]!)),
      center: [mid.x, mid.y, mid.z],
      cornerLabels,
    });
  }

  return { faces, vertices };
}

function buildD10Geometry(): {
  geometry: BufferGeometry;
  faces: FaceDef[];
  outline: BufferGeometry;
} {
  // Pentagonal trapezohedron: 10 kite faces (no separate polar-cap tris).
  // ringY = tan²(π/10) keeps each kite planar for poles at ±1 and ring radius 1.
  const N = new Vector3(0, 1, 0);
  const S = new Vector3(0, -1, 0);
  const R = 1;
  const ringY = Math.tan(Math.PI / 10) ** 2;
  const U: Vector3[] = [];
  const V: Vector3[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const b = a + Math.PI / 5;
    U.push(new Vector3(Math.cos(a) * R, ringY, Math.sin(a) * R));
    V.push(new Vector3(Math.cos(b) * R, -ringY, Math.sin(b) * R));
  }

  const positions: number[] = [];
  const faces: FaceDef[] = [];
  // Unique silhouette edges (no kite diagonals, no double-drawn equator).
  const outlinePos: number[] = [];
  const seenEdges = new Set<string>();
  const pushEdge = (p: Vector3, q: Vector3) => {
    const a = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
    const b = `${q.x.toFixed(5)},${q.y.toFixed(5)},${q.z.toFixed(5)}`;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    outlinePos.push(p.x, p.y, p.z, q.x, q.y, q.z);
  };

  const pushTri = (p: Vector3, q: Vector3, r: Vector3) => {
    positions.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  };

  /** Kite a–b–c–d as two triangles. Keep shared verts unmoved so the mesh stays watertight. */
  const pushKite = (
    a: Vector3,
    b: Vector3,
    c: Vector3,
    d: Vector3,
    value: number,
  ) => {
    const mid = new Vector3()
      .addVectors(a, b)
      .add(c)
      .add(d)
      .multiplyScalar(0.25);
    // Planar kite: both tris share this normal.
    const n = new Vector3()
      .crossVectors(
        new Vector3().subVectors(b, a),
        new Vector3().subVectors(d, a),
      )
      .normalize();
    if (n.dot(mid) < 0) n.negate();

    const wind = (p: Vector3, q: Vector3, r: Vector3) => {
      const tn = new Vector3()
        .crossVectors(
          new Vector3().subVectors(q, p),
          new Vector3().subVectors(r, p),
        );
      if (tn.dot(n) >= 0) pushTri(p, q, r);
      else pushTri(p, r, q);
    };
    wind(a, b, c);
    wind(a, c, d);

    // Outline uses the kite border only (no diagonal).
    pushEdge(a, b);
    pushEdge(b, c);
    pushEdge(c, d);
    pushEdge(d, a);

    // Align toward the polar tip so every kite shares the same present twist.
    const poleAlign = new Vector3().subVectors(a, mid);
    poleAlign.addScaledVector(n, -poleAlign.dot(n));
    let align: [number, number, number];
    if (poleAlign.lengthSq() > 1e-8) {
      poleAlign.normalize();
      align = [poleAlign.x, poleAlign.y, poleAlign.z];
    } else {
      align = alignFromFaceVerts(n, [a, b, c, d]);
    }

    faces.push({
      normal: [n.x, n.y, n.z],
      value,
      align,
      center: [mid.x, mid.y, mid.z],
    });
  };

  for (let i = 0; i < 5; i++) {
    const j = (i + 1) % 5;
    pushKite(N, U[i]!, V[i]!, U[j]!, i + 1);
    pushKite(S, V[i]!, U[j]!, V[j]!, i + 6);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

  const outline = new BufferGeometry();
  outline.setAttribute('position', new Float32BufferAttribute(outlinePos, 3));
  return { geometry, faces, outline };
}

export type DieMeshSpec = {
  geometry: BufferGeometry;
  faces: FaceDef[];
  /** Approximate radius for colliders / roll sync. */
  radius: number;
  /** 'ball' | 'cuboid' | 'hull' hint for Rapier. */
  collider: 'cuboid' | 'ball' | 'hull';
  cuboidHalf?: [number, number, number];
  /** Optional prebuilt silhouette lines (used when EdgesGeometry would double-draw). */
  outline?: BufferGeometry;
  /** d4 vertex marks for result reading / present pose. */
  vertices?: VertexMark[];
};

/**
 * Planar-project each triangle into its face's atlas cell so albedo/normal
 * maps line up with FaceDef order (and glyph-up = +V = face.align).
 */
function applyDieFaceAtlasUvs(geometry: BufferGeometry, faces: FaceDef[]): BufferGeometry {
  const mesh =
    geometry.getIndex() != null ? geometry.toNonIndexed() : geometry;
  if (mesh !== geometry) {
    geometry.dispose();
  }

  const pos = mesh.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const { cols } = dieAtlasGrid(faces.length);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  const n = new Vector3();
  const p = new Vector3();

  type Frame = {
    faceIndex: number;
    uAxis: Vector3;
    vAxis: Vector3;
    center: Vector3;
    uMin: number;
    uMax: number;
    vMin: number;
    vMax: number;
  };
  const frames: Frame[] = faces.map((face, faceIndex) => {
    const normal = new Vector3(face.normal[0], face.normal[1], face.normal[2]).normalize();
    const align = face.align
      ? new Vector3(face.align[0], face.align[1], face.align[2])
      : new Vector3(1, 0, 0);
    align.addScaledVector(normal, -align.dot(normal));
    if (align.lengthSq() < 1e-10) {
      const ref = Math.abs(normal.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
      align.crossVectors(normal, ref);
    }
    align.normalize();
    const ua = new Vector3().crossVectors(align, normal).normalize();
    const va = align.clone();
    const ctr = face.center
      ? new Vector3(face.center[0], face.center[1], face.center[2])
      : new Vector3(normal.x, normal.y, normal.z).multiplyScalar(0.5);
    return {
      faceIndex,
      uAxis: ua,
      vAxis: va,
      center: ctr,
      uMin: Infinity,
      uMax: -Infinity,
      vMin: Infinity,
      vMax: -Infinity,
    };
  });

  const triFace: number[] = [];
  const triCount = pos.count / 3;
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac).normalize();

    let best = 0;
    let bestDot = -Infinity;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i]!;
      const d =
        n.x * f.normal[0] + n.y * f.normal[1] + n.z * f.normal[2];
      if (d > bestDot) {
        bestDot = d;
        best = i;
      }
    }
    triFace[t] = best;
    const frame = frames[best]!;
    for (const v of [a, b, c]) {
      p.copy(v).sub(frame.center);
      const uu = p.dot(frame.uAxis);
      const vv = p.dot(frame.vAxis);
      frame.uMin = Math.min(frame.uMin, uu);
      frame.uMax = Math.max(frame.uMax, uu);
      frame.vMin = Math.min(frame.vMin, vv);
      frame.vMax = Math.max(frame.vMax, vv);
    }
  }

  for (const frame of frames) {
    if (!(frame.uMax > frame.uMin)) {
      frame.uMin = -0.5;
      frame.uMax = 0.5;
    }
    if (!(frame.vMax > frame.vMin)) {
      frame.vMin = -0.5;
      frame.vMax = 0.5;
    }
    // Padding so glyphs stay inside the cell.
    const uPad = (frame.uMax - frame.uMin) * 0.12;
    const vPad = (frame.vMax - frame.vMin) * 0.12;
    frame.uMin -= uPad;
    frame.uMax += uPad;
    frame.vMin -= vPad;
    frame.vMax += vPad;

    const face = faces[frame.faceIndex]!;
    face.uvFrame = {
      uMin: frame.uMin,
      uMax: frame.uMax,
      vMin: frame.vMin,
      vMax: frame.vMax,
    };
    if (!face.align) {
      face.align = [frame.vAxis.x, frame.vAxis.y, frame.vAxis.z];
    }
    if (!face.center) {
      face.center = [frame.center.x, frame.center.y, frame.center.z];
    }
  }

  for (let t = 0; t < triCount; t++) {
    const faceIndex = triFace[t]!;
    const frame = frames[faceIndex]!;
    const col = faceIndex % cols;
    const row = Math.floor(faceIndex / cols);
    const u0 = col / cols;
    const u1 = (col + 1) / cols;
    // Canvas row 0 is top; with flipY that maps to high V.
    const v1 = 1 - row / cols;
    const v0 = 1 - (row + 1) / cols;
    const du = frame.uMax - frame.uMin;
    const dv = frame.vMax - frame.vMin;

    for (let k = 0; k < 3; k++) {
      const vi = t * 3 + k;
      p.fromBufferAttribute(pos, vi).sub(frame.center);
      const uN = (p.dot(frame.uAxis) - frame.uMin) / du;
      const vN = (p.dot(frame.vAxis) - frame.vMin) / dv;
      uv[vi * 2] = u0 + uN * (u1 - u0);
      uv[vi * 2 + 1] = v0 + vN * (v1 - v0);
    }
  }

  mesh.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  mesh.computeVertexNormals();
  return mesh;
}

const cache = new Map<DiceSides, DieMeshSpec>();

export function getDieMeshSpec(sides: DiceSides): DieMeshSpec {
  const hit = cache.get(sides);
  if (hit) return hit;

  let spec: DieMeshSpec;
  switch (sides) {
    case 4: {
      const geometry = new TetrahedronGeometry(1, 0);
      fitUnitMaxExtent(geometry);
      const { faces, vertices } = buildD4Faces(geometry);
      spec = {
        geometry,
        faces,
        vertices,
        radius: geometry.boundingSphere?.radius ?? 0.87,
        collider: 'hull',
      };
      break;
    }
    case 6: {
      const geometry = new BoxGeometry(1, 1, 1);
      fitUnitMaxExtent(geometry);
      // Unit cube → max extent 1 ⇒ half-extent 0.5.
      const he = 0.5;
      spec = {
        geometry,
        faces: d6Faces(he),
        radius: geometry.boundingSphere?.radius ?? Math.sqrt(0.75),
        collider: 'cuboid',
        cuboidHalf: [he, he, he],
      };
      break;
    }
    case 8: {
      const geometry = new OctahedronGeometry(1, 0);
      fitUnitMaxExtent(geometry);
      const faces = assignOppositeSum(
        facesFromUniqueNormals(geometry, (i) => i + 1),
        9,
      );
      spec = {
        geometry,
        faces,
        radius: geometry.boundingSphere?.radius ?? 0.5,
        collider: 'hull',
      };
      break;
    }
    case 10: {
      const { geometry, faces, outline } = buildD10Geometry();
      const { offset, scale } = fitUnitMaxExtent(geometry, outline);
      remapFaceCenters(faces, offset, scale);
      assignOppositeSum(faces, 11);
      spec = {
        geometry,
        faces,
        outline,
        radius: geometry.boundingSphere?.radius ?? 0.55,
        collider: 'hull',
      };
      break;
    }
    case 12: {
      const geometry = new DodecahedronGeometry(1, 0);
      fitUnitMaxExtent(geometry);
      const faces = assignOppositeSum(
        facesFromUniqueNormals(geometry, (i) => i + 1).slice(0, 12),
        13,
      );
      spec = {
        geometry,
        faces,
        radius: geometry.boundingSphere?.radius ?? 0.55,
        collider: 'hull',
      };
      break;
    }
    case 20: {
      const geometry = new IcosahedronGeometry(1, 0);
      fitUnitMaxExtent(geometry);
      const faces = assignOppositeSum(
        facesFromUniqueNormals(geometry, (i) => i + 1).slice(0, 20),
        21,
      );
      spec = {
        geometry,
        faces,
        radius: geometry.boundingSphere?.radius ?? 0.55,
        collider: 'hull',
      };
      break;
    }
  }

  // Ensure face count matches sides (pad/trim defensively).
  if (spec.faces.length > sides) spec.faces = spec.faces.slice(0, sides);
  while (spec.faces.length < sides) {
    const i = spec.faces.length;
    spec.faces.push({ normal: [0, 1, 0], value: i + 1 });
  }

  spec.geometry = applyDieFaceAtlasUvs(spec.geometry, spec.faces);

  cache.set(sides, spec);
  return spec;
}

export function dieAccentColor(sides: DiceSides): string {
  switch (sides) {
    case 4:
      return '#ea580c'; // vivid orange
    case 6:
      return '#4f46e5'; // vivid indigo
    case 8:
      return '#0891b2'; // vivid cyan
    case 10:
      return '#16a34a'; // vivid green
    case 12:
      return '#9333ea'; // vivid purple
    case 20:
      return '#dc2626'; // vivid red
  }
}

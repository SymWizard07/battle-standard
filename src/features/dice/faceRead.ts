import { Quaternion, Vector3 } from 'three';

export type FaceCornerLabel = {
  value: number;
  position: [number, number, number];
  /** In-face "up" for the glyph — points toward the corner / vertex. */
  align: [number, number, number];
};

export type FaceDef = {
  /** Unit normal in local mesh space pointing *out* of the face. */
  normal: [number, number, number];
  value: number;
  /**
   * Unit vector in the face plane = glyph "up" for the face number.
   * After the face is mapped to +Y, this is twisted to world −Z (away from the
   * tray camera on +Z) so numbers read upright.
   */
  align?: [number, number, number];
  /** Face centroid in local mesh space (for labels / contact). */
  center?: [number, number, number];
  /**
   * d4-style: three numbers on the face (vertex numbers), each rotated
   * toward its corner. Numbers repeat across the three faces of a vertex.
   */
  cornerLabels?: FaceCornerLabel[];
  /**
   * Tangent-space bounds used for the face atlas cell (set when UVs are applied).
   * Texture painting uses the same frame so glyphs land on the mesh.
   */
  uvFrame?: {
    uMin: number;
    uMax: number;
    vMin: number;
    vMax: number;
  };
};

/** Vertex mark for d4 reading (result = highest world-Y vertex). */
export type VertexMark = {
  value: number;
  position: [number, number, number];
};

export type UpwardFaceResult = {
  value: number;
  /** World-space outward normal · world up (1 = straight up, -1 = straight down). */
  upwardness: number;
  /** upwardness of the runner-up face (edge/corner balance ⇒ close to upwardness). */
  runnerUpwardness: number;
  /** upwardness − runnerUpwardness; near 0 means balanced on an edge/corner. */
  margin: number;
  /**
   * True when one face clearly points up (resting flat, not an edge/corner).
   * Informational only — settle locks the nearest face once motion stops.
   */
  stable: boolean;
  worldNormal: [number, number, number];
};

const _n = new Vector3();
const _up = new Vector3(0, 1, 0);

/** Min best-face · up to count as "pointing up". */
export const FACE_UP_MIN = 0.72;
/**
 * Min gap between best and second-best · up.
 * Edge balance keeps this near 0 even when upwardness looks high (e.g. d20).
 */
export const FACE_MARGIN_MIN = 0.08;

/**
 * Select the face whose outward normal points most upward in world space
 * (highest vertical component / most aligned with +Y).
 *
 * This is the face that should be read as the result for a settled die.
 */
export function selectUpwardFace(
  faces: FaceDef[],
  quat: Quaternion,
  up: Vector3 = _up,
): UpwardFaceResult {
  if (faces.length === 0) {
    return {
      value: 1,
      upwardness: 1,
      runnerUpwardness: -1,
      margin: 2,
      stable: true,
      worldNormal: [0, 1, 0],
    };
  }

  let best = faces[0]!;
  let bestScore = -Infinity;
  let secondScore = -Infinity;
  const bestWorld = new Vector3();

  for (const face of faces) {
    _n.set(face.normal[0], face.normal[1], face.normal[2]);
    if (_n.lengthSq() < 1e-12) continue;
    _n.normalize();
    // Local outward normal → world (body orientation).
    _n.applyQuaternion(quat);
    // Highest vertically + pointing up ⇒ maximize alignment with world up.
    const score = _n.dot(up);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = face;
      bestWorld.copy(_n);
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  const margin = bestScore - secondScore;
  return {
    value: best.value,
    upwardness: bestScore,
    runnerUpwardness: secondScore,
    margin,
    stable: bestScore >= FACE_UP_MIN && margin >= FACE_MARGIN_MIN,
    worldNormal: [bestWorld.x, bestWorld.y, bestWorld.z],
  };
}

/**
 * Read the upward face value from local face normals and a world quaternion.
 * Equivalent to `selectUpwardFace(...).value`.
 */
export function readFaceValue(
  faces: FaceDef[],
  quat: Quaternion,
  up: Vector3 = _up,
): number {
  return selectUpwardFace(faces, quat, up).value;
}

/**
 * Read a die result. Standard polyhedra use the upward face; d4 uses the
 * highest world-space vertex (numbers live on vertices / face corners).
 */
export function readDieResult(
  faces: FaceDef[],
  quat: Quaternion,
  vertices?: VertexMark[],
  up: Vector3 = _up,
): number {
  if (vertices && vertices.length > 0) {
    const p = new Vector3();
    let best = vertices[0]!;
    let bestScore = -Infinity;
    for (const v of vertices) {
      p.set(v.position[0], v.position[1], v.position[2]).applyQuaternion(quat);
      const score = p.dot(up);
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best.value;
  }
  return selectUpwardFace(faces, quat, up).value;
}

/** Quaternion that rotates `from` unit vector to `to` unit vector. */
export function quatFromTo(from: Vector3, to: Vector3): Quaternion {
  const q = new Quaternion();
  q.setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  return q;
}

/**
 * Orientation that puts the scored face/vertex pointing straight up (+Y),
 * then twists around Y for a camera-facing reveal.
 *
 * Standard dice: glyph-up (`align`) → world −Z (upright from the +Z tray cam).
 * d4: a face that shows the result at a corner lies flat on top (like other dice),
 * with that corner twisted to −Z so the number sits upright at the top of the triangle.
 */
export function presentOrientation(
  faces: FaceDef[],
  value: number,
  alignTarget: Vector3 = new Vector3(0, 0, -1),
  vertices?: VertexMark[],
): Quaternion {
  // d4: present a result-bearing face flat-up (not vertex-up / edge-on).
  if (vertices && vertices.length > 0) {
    const adjacent = faces.filter((f) =>
      f.cornerLabels?.some((c) => c.value === value),
    );
    const face =
      adjacent.slice().sort((a, b) => a.value - b.value)[0] ?? faces[0];
    if (!face) return new Quaternion();

    const corner =
      face.cornerLabels?.find((c) => c.value === value) ??
      face.cornerLabels?.[0];
    const localOut = new Vector3(
      face.normal[0],
      face.normal[1],
      face.normal[2],
    ).normalize();
    const toWorldUp = quatFromTo(localOut, new Vector3(0, 1, 0));

    const localAlign = new Vector3();
    if (corner) {
      localAlign.set(corner.align[0], corner.align[1], corner.align[2]);
    } else if (face.align) {
      localAlign.set(face.align[0], face.align[1], face.align[2]);
    } else {
      localAlign.set(1, 0, 0);
      if (Math.abs(localOut.dot(localAlign)) > 0.9) localAlign.set(0, 0, 1);
      localAlign.crossVectors(localOut, localAlign).normalize();
    }
    localAlign.addScaledVector(localOut, -localAlign.dot(localOut));
    if (localAlign.lengthSq() < 1e-10) return toWorldUp;
    localAlign.normalize();

    const worldAlign = localAlign.applyQuaternion(toWorldUp);
    worldAlign.y = 0;
    if (worldAlign.lengthSq() < 1e-6) return toWorldUp;
    worldAlign.normalize();

    const desired = alignTarget.clone();
    desired.y = 0;
    if (desired.lengthSq() < 1e-6) desired.set(0, 0, -1);
    desired.normalize();

    const twist = quatFromTo(worldAlign, desired);
    const flat = twist.multiply(toWorldUp);

    // Slight tip lifts the result corner so vertex-read still matches, while the
    // face stays mostly flat toward the tray camera.
    const tip = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.22);
    return tip.multiply(flat);
  }

  const face = faces.find((f) => f.value === value) ?? faces[0];
  if (!face) return new Quaternion();
  const localOut = new Vector3(face.normal[0], face.normal[1], face.normal[2]).normalize();
  // Map this face's outward normal onto world +Y (pointing up).
  const toWorldUp = quatFromTo(localOut, new Vector3(0, 1, 0));

  const localAlign = new Vector3();
  if (face.align) {
    localAlign.set(face.align[0], face.align[1], face.align[2]);
  } else {
    localAlign.set(1, 0, 0);
    if (Math.abs(localOut.dot(localAlign)) > 0.9) localAlign.set(0, 0, 1);
    localAlign.crossVectors(localOut, localAlign).normalize();
  }
  // Keep align in the face plane (defensive).
  localAlign.addScaledVector(localOut, -localAlign.dot(localOut));
  if (localAlign.lengthSq() < 1e-10) return toWorldUp;
  localAlign.normalize();

  const worldAlign = localAlign.applyQuaternion(toWorldUp);
  worldAlign.y = 0;
  if (worldAlign.lengthSq() < 1e-6) return toWorldUp;
  worldAlign.normalize();

  const desired = alignTarget.clone();
  desired.y = 0;
  if (desired.lengthSq() < 1e-6) desired.set(0, 0, -1);
  desired.normalize();

  const twist = quatFromTo(worldAlign, desired);
  return twist.multiply(toWorldUp);
}

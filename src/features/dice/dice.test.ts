import { presentOrientation, readDieResult, readFaceValue, selectUpwardFace } from './faceRead';
import { computeClusterSlot, maxGridColumns, traySizeFromAspect } from './trayLayout';
import { getDieMeshSpec } from './diceMeshes';
import { DICE_SIDES, diePoolScaleFactor, dieScale } from './diceTypes';
import { Quaternion, Vector3 } from 'three';
import { computePresentLayout } from './presentLayout';
import { parseDiceTrayExpression } from './diceExpression';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function runTests() {
  {
    const p = parseDiceTrayExpression('d20+1d4-2');
    assert(p);
    assert(p.dice.includes(20) && p.dice.includes(4));
  }

  {
    const big = parseDiceTrayExpression('50d6');
    assert(big && big.dice.length === 50, 'expressions may request up to MAX_DICE');
    assert(parseDiceTrayExpression('101d6') == null, 'over MAX_DICE per term rejected');
    assert(parseDiceTrayExpression('60d6+50d8') == null, 'over MAX_DICE total rejected');
  }

  // Opposite faces sum to n+1 (standard polyhedral convention).
  for (const [sides, pairSum] of [
    [6, 7],
    [8, 9],
    [10, 11],
    [12, 13],
    [20, 21],
  ] as const) {
    const faces = getDieMeshSpec(sides).faces;
    const values = faces.map((f) => f.value).sort((a, b) => a - b);
    assert(
      values.join(',') === Array.from({ length: sides }, (_, i) => i + 1).join(','),
      `d${sides} should use values 1..${sides}`,
    );
    const seen = new Set<number>();
    for (const f of faces) {
      if (seen.has(f.value)) continue;
      const n = new Vector3(f.normal[0], f.normal[1], f.normal[2]);
      let best = f;
      let bestDot = Infinity;
      for (const o of faces) {
        if (o.value === f.value) continue;
        const d = n.dot(new Vector3(o.normal[0], o.normal[1], o.normal[2]));
        if (d < bestDot) {
          bestDot = d;
          best = o;
        }
      }
      seen.add(f.value);
      seen.add(best.value);
      assert(
        f.value + best.value === pairSum,
        `d${sides}: ${f.value} opposite ${best.value} should sum to ${pairSum}`,
      );
      assert(bestDot < -0.85, `d${sides}: opposite normals should anti-align (dot=${bestDot})`);
    }
  }

  {
    const faces = getDieMeshSpec(6).faces;
    const identity = new Quaternion();
    const up = selectUpwardFace(faces, identity);
    assert(up.value === 1, `d6 identity should read 1 (got ${up.value})`);
    assert(up.upwardness > 0.99, `d6 identity upwardness should be ~1 (got ${up.upwardness})`);
    assert(up.worldNormal[1] > 0.99, 'selected face normal must point up');

    const flip = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
    const down = selectUpwardFace(faces, flip);
    assert(down.value === 6, `d6 flipped should read 6 (got ${down.value})`);
    assert(down.upwardness > 0.99, `flipped upwardness should be ~1 (got ${down.upwardness})`);
    assert(down.worldNormal[1] > 0.99, 'flipped selected normal must point up');

    // Side-lying: +X face normal rotates onto +Y → value 2
    const tip = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
    const side = selectUpwardFace(faces, tip);
    assert(side.value === 2, `d6 tipped should read 2 (got ${side.value})`);
    assert(side.worldNormal[1] > 0.99, 'tipped selected normal must point up');
    assert(side.stable, 'flat face rest must be stable');

    // Balanced on an edge: rotate 45° around Z so +Y and +X share the up axis.
    const edge = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4);
    const onEdge = selectUpwardFace(faces, edge);
    assert(!onEdge.stable, 'edge-balanced d6 must not count as settled');
    assert(onEdge.margin < 0.05, `edge margin should be ~0 (got ${onEdge.margin})`);

    const present = presentOrientation(faces, 6);
    const presented = selectUpwardFace(faces, present);
    assert(presented.value === 6, `presentOrientation(6) should read 6 (got ${presented.value})`);
    assert(presented.worldNormal[1] > 0.99, 'presented face normal must point up');
  }

  {
    const spec = getDieMeshSpec(4);
    assert(spec.vertices?.length === 4, 'd4 should have 4 vertex marks');
    assert(spec.faces.length === 4, 'd4 should have 4 faces');
    for (const face of spec.faces) {
      assert(
        face.cornerLabels?.length === 3,
        `d4 face ${face.value} should have 3 corner numbers`,
      );
    }
    for (const v of [1, 2, 3, 4] as const) {
      const q = presentOrientation(spec.faces, v, undefined, spec.vertices);
      const read = readDieResult(spec.faces, q, spec.vertices);
      assert(read === v, `d4 present vertex ${v} but read ${read}`);

      // A face showing the result should lie nearly flat on top.
      const adjacent = spec.faces.filter((f) =>
        f.cornerLabels?.some((c) => c.value === v),
      );
      let bestY = -Infinity;
      let bestFace = adjacent[0]!;
      for (const f of adjacent) {
        const n = new Vector3(f.normal[0], f.normal[1], f.normal[2])
          .normalize()
          .applyQuaternion(q);
        if (n.y > bestY) {
          bestY = n.y;
          bestFace = f;
        }
      }
      assert(
        bestY > 0.85,
        `d4 present ${v}: result face should be flat-up (best n.y=${bestY})`,
      );
      const corner = bestFace.cornerLabels?.find((c) => c.value === v);
      assert(corner, `d4 present ${v}: missing corner label on flat face`);
      const align = new Vector3(corner.align[0], corner.align[1], corner.align[2])
        .normalize()
        .applyQuaternion(q);
      align.y = 0;
      assert(align.lengthSq() > 1e-6, `d4 present ${v}: corner align vertical`);
      align.normalize();
      assert(
        align.z < -0.7,
        `d4 present ${v}: result corner should aim −Z (got z=${align.z})`,
      );
    }
  }

  // For every non-d4 polyset: present each face, then upward-read must return that face.
  for (const sides of DICE_SIDES) {
    if (sides === 4) continue;
    const faces = getDieMeshSpec(sides).faces;
    for (const face of faces) {
      const q = presentOrientation(faces, face.value);
      const picked = selectUpwardFace(faces, q);
      assert(
        picked.value === face.value,
        `d${sides} present ${face.value} but read ${picked.value}`,
      );
      assert(
        picked.worldNormal[1] > 0.85,
        `d${sides} value ${face.value} normal.y=${picked.worldNormal[1]}`,
      );
      assert(
        picked.stable,
        `d${sides} presented value ${face.value} should be face-stable (up=${picked.upwardness} margin=${picked.margin})`,
      );
      if (face.align) {
        const align = new Vector3(face.align[0], face.align[1], face.align[2])
          .normalize()
          .applyQuaternion(q);
        align.y = 0;
        assert(align.lengthSq() > 1e-6, `d${sides} align became vertical`);
        align.normalize();
        assert(
          align.z < -0.95,
          `d${sides} value ${face.value} glyph-up should face −Z (got ${align.x.toFixed(3)},${align.z.toFixed(3)})`,
        );
      }
      for (const other of faces) {
        const n = new Vector3(other.normal[0], other.normal[1], other.normal[2])
          .normalize()
          .applyQuaternion(q);
        assert(
          n.y <= picked.worldNormal[1] + 1e-5,
          `d${sides}: face ${other.value} y=${n.y} > picked ${picked.value} y=${picked.worldNormal[1]}`,
        );
      }
    }
  }

  // Face atlas UVs exist so albedo/normal maps can bind per face.
  for (const sides of DICE_SIDES) {
    const geo = getDieMeshSpec(sides).geometry;
    const uv = geo.getAttribute('uv');
    assert(uv && uv.count === geo.getAttribute('position').count, `d${sides} missing face UVs`);
    assert(getDieMeshSpec(sides).faces.every((f) => f.uvFrame), `d${sides} faces missing uvFrame`);
  }

  assert(typeof readFaceValue === 'function');

  {
    const wide = traySizeFromAspect(2);
    const tall = traySizeFromAspect(0.6);
    assert(wide.halfW > wide.halfD, 'wide panel tray should be wider than deep');
    assert(tall.halfD > tall.halfW, 'tall panel tray should be deeper than wide');
    assert(
      maxGridColumns(wide.halfW) > maxGridColumns(tall.halfW),
      'wider tray should allow more spawn columns',
    );

    const slot0 = computeClusterSlot(0, 8, wide.halfW, wide.halfD);
    const slot7 = computeClusterSlot(7, 8, wide.halfW, wide.halfD);
    assert(Number.isFinite(slot0.x) && Number.isFinite(slot7.z));
    assert(Math.hypot(slot0.x, slot0.z) < 0.05, 'first cluster slot should be near center');
    const slots = Array.from({ length: 8 }, (_, i) =>
      computeClusterSlot(i, 8, wide.halfW, wide.halfD),
    );
    const clusterR = Math.max(...slots.map((s) => Math.hypot(s.x, s.z)));
    assert(clusterR < 2.1, `cluster should stay compact (got r=${clusterR})`);
    for (let a = 0; a < 8; a++) {
      for (let b = a + 1; b < 8; b++) {
        const d = Math.hypot(slots[a].x - slots[b].x, slots[a].z - slots[b].z);
        assert(d > 0.35, `cluster slots ${a} and ${b} should not overlap (d=${d})`);
      }
    }

    const narrowCols = maxGridColumns(tall.halfW);
    const wideCols = maxGridColumns(wide.halfW);
    assert(wideCols >= narrowCols);

    const layout = computePresentLayout(
      Array.from({ length: 8 }, (_, i) => ({
        id: `d${i}`,
        sides: 6 as const,
        value: i + 1,
      })),
      wide.halfW,
      wide.halfD,
    );
    assert(layout.length === 8);
    assert(wideCols >= 4, `wide tray should fit several columns (got ${wideCols})`);

    // Present rows must fit inside the tray given die footprint (no edge clamp hacks).
    {
      const many = computePresentLayout(
        Array.from({ length: 20 }, (_, i) => ({
          id: `p${i}`,
          sides: (i % 2 === 0 ? 20 : 6) as 6 | 20,
          value: (i % 20) + 1,
        })),
        tall.halfW,
        tall.halfD,
      );
      assert(many.length === 20);
      const span = Math.max(...many.map((s) => dieScale(s.sides, many.length))) * 1.08;
      const pad = Math.max(0.28, span * 0.22);
      for (const s of many) {
        assert(
          Math.abs(s.x) + span / 2 <= tall.halfW - pad + 1e-3,
          `present x overflow: |${s.x}| + ${span / 2} vs halfW ${tall.halfW} pad ${pad}`,
        );
        assert(
          Math.abs(s.z) + span / 2 <= tall.halfD - pad + 1e-3,
          `present z overflow: |${s.z}| + ${span / 2} vs halfD ${tall.halfD} pad ${pad}`,
        );
      }
      // Narrow tray: a full row must not exceed what fits.
      const xs = many.map((s) => s.x);
      const rowZ = many[0]!.z;
      const row = many.filter((s) => Math.abs(s.z - rowZ) < 1e-6);
      assert(row.length >= 1);
      const rowSpan = Math.max(...row.map((s) => s.x)) - Math.min(...row.map((s) => s.x));
      assert(
        rowSpan + span <= 2 * (tall.halfW - pad) + 1e-3,
        `row wider than tray (span=${rowSpan}, need ≤${2 * (tall.halfW - pad) - span})`,
      );
      void xs;
    }

    // Row lengths differ by at most one.
    {
      const layout = computePresentLayout(
        Array.from({ length: 10 }, (_, i) => ({
          id: `e${i}`,
          sides: 6 as const,
          value: i + 1,
        })),
        wide.halfW,
        wide.halfD,
      );
      const rowCounts = new Map<number, number>();
      for (const s of layout) {
        const zKey = Math.round(s.z * 1000);
        rowCounts.set(zKey, (rowCounts.get(zKey) ?? 0) + 1);
      }
      const counts = [...rowCounts.values()];
      assert(counts.length >= 1);
      assert(
        Math.max(...counts) - Math.min(...counts) <= 1,
        `row counts should be even (got ${counts.join(',')})`,
      );
    }

    assert(diePoolScaleFactor(20) === 1);
    assert(diePoolScaleFactor(21) === 0.5);
    assert(dieScale(6, 21) === dieScale(6, 1) * 0.5);
  }

  console.log('dice tests passed');
}

runTests();

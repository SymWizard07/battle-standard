/**
 * Generates monochrome overlay graphics for bottom toolbar buttons.
 * Run: npm run generate:icons
 */
import { createCanvas } from 'canvas';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  FOG_ICON_WIDTH_PX,
  FOG_STRATA_LINE_WIDTH_PX,
  FOG_STRATA_LINES,
  TOOLBAR_HEIGHT_PX,
} from '../src/features/toolbar/toolbarOverlayMetrics.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/icons/toolbar');

mkdirSync(outDir, { recursive: true });

function save(
  name: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);
  writeFileSync(join(outDir, name), canvas.toBuffer('image/png'));
  console.log(`Wrote ${name}`);
}

function strokeWhite(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  angle: number,
  size = 14,
  base = 0.72,
) {
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * base);
  ctx.lineTo(-size, size * base);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Tall pan cross — meant to extend past button bounds when centered.
save('pan.png', 96, 128, (ctx, w, h) => {
  strokeWhite(ctx);
  ctx.lineWidth = 4;
  const cx = w / 2;
  const cy = h / 2;
  const arm = 52;
  const tipInset = 18;
  const tip = arm - tipInset;
  const headLen = 14;

  // Lines stop at the arrowhead base (headLen inward from each tip).
  ctx.beginPath();
  ctx.moveTo(cx, cy - tip + headLen);
  ctx.lineTo(cx, cy + tip - headLen);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - tip + headLen, cy);
  ctx.lineTo(cx + tip - headLen, cy);
  ctx.stroke();

  drawArrowHead(ctx, cx, cy - tip, -Math.PI / 2);
  drawArrowHead(ctx, cx, cy + tip, Math.PI / 2);
  drawArrowHead(ctx, cx - tip, cy, Math.PI);
  drawArrowHead(ctx, cx + tip, cy, 0);
});

save('select.png', 96, 96, (ctx, w, h) => {
  strokeWhite(ctx);
  ctx.lineWidth = 2.5;
  const cx = w / 2;
  const cy = h / 2;

  ctx.beginPath();
  ctx.arc(cx, cy, 43, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fill();
});

// Tileable ruler tick strip for full-button background.
save('measure.png', 128, 80, (ctx, w, h) => {
  strokeWhite(ctx);
  ctx.lineWidth = 1.5;
  const baseline = h - 6;
  for (let x = 0; x <= w; x += 4) {
    const major = x % 32 === 0;
    const mid = x % 16 === 0;
    const tickH = major ? 28 : mid ? 18 : 10;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, baseline);
    ctx.lineTo(x + 0.5, baseline - tickH);
    ctx.stroke();
  }
});

save('grid.png', 24, 24, (ctx, w, h) => {
  strokeWhite(ctx);
  ctx.lineWidth = 2;
  const cells = 3;
  const step = w / cells;
  for (let i = 0; i <= cells; i++) {
    const x = i * step;
    const y = i * step;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
});

function cubicBezierUnit(
  t: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
): { x: number; y: number } {
  const u = 1 - t;
  const x = 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t;
  let y = 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t;
  y = Math.max(0, Math.min(1, y));
  return { x, y };
}

save('map.png', 168, 96, (ctx, w, h) => {
  strokeWhite(ctx);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const pad = 4;
  const left = 0;
  const bottom = h;
  const xArm = 10;
  const xLineWidth = 5;
  const xCx = w - pad - xArm - 2;
  const xCy = pad + xArm + 1;
  const right = xCx;
  const top = xCy + 16;

  // cubic-bezier(.14, 1.48, .92, -.47) with y trimmed to [0, 1]
  const p1x = 0.14;
  const p1y = 1.48;
  const p2x = 0.92;
  const p2y = -0.47;

  ctx.lineWidth = 4;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { x, y } = cubicBezierUnit(t, p1x, p1y, p2x, p2y);
    const px = left + x * (right - left);
    const py = bottom - y * (bottom - top);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.lineTo(xCx, xCy);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.lineWidth = xLineWidth;
  ctx.beginPath();
  ctx.moveTo(xCx - xArm, xCy - xArm);
  ctx.lineTo(xCx + xArm, xCy + xArm);
  ctx.moveTo(xCx + xArm, xCy - xArm);
  ctx.lineTo(xCx - xArm, xCy + xArm);
  ctx.stroke();
});

save('fog.png', FOG_ICON_WIDTH_PX, TOOLBAR_HEIGHT_PX, (ctx, w, h) => {
  strokeWhite(ctx);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = FOG_STRATA_LINE_WIDTH_PX;

  for (const line of FOG_STRATA_LINES) {
    ctx.beginPath();
    ctx.moveTo(line.x0, line.y);
    ctx.lineTo(line.x1, line.y);
    ctx.stroke();
  }
});

save('draw.png', 168, 96, (ctx, w, h) => {
  strokeWhite(ctx);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;

  const sx = w * 0.14;
  const sy = h * 0.86;
  const tipX = w * 0.82;
  const tipY = h * 0.16;
  const bandX = w * 0.28;
  const bandY = h * 0.72;
  const backX = w * 0.2;
  const backY = h * 0.92;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(bandX, bandY);
  ctx.lineTo(backX, backY);
  ctx.lineTo(sx, sy);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bandX, bandY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx + w * 0.04, sy - h * 0.04);
  ctx.lineTo(backX + w * 0.03, backY - h * 0.03);
  ctx.stroke();
});

console.log('Done.');

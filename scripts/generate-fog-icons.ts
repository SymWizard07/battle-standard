/**
 * Generates transparent PNG icons for fog tools.
 * Run: npm run generate:icons
 */
import { createCanvas } from 'canvas';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/icons/fog');

mkdirSync(outDir, { recursive: true });

const SIZE = 64;

function save(name: string, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, SIZE, SIZE);
  draw(ctx);
  writeFileSync(join(outDir, name), canvas.toBuffer('image/png'));
  console.log(`Wrote ${name}`);
}

save('spline.png', (ctx) => {
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(10, 42);
  ctx.bezierCurveTo(18, 16, 34, 60, 54, 22);
  ctx.stroke();
  // endpoints
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(10, 42, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(54, 22, 4, 0, Math.PI * 2);
  ctx.fill();
});

save('rect.png', (ctx) => {
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(14, 14, 36, 36);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(56,189,248,0.18)';
  ctx.fillRect(16, 16, 32, 32);
});

console.log('Done.');


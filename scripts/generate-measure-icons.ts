/**
 * Generates transparent PNG icons for measurement tools.
 * Run: npm run generate:icons
 */
import { createCanvas } from 'canvas';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/icons/measures');

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

save('ruler.png', (ctx) => {
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(12, 48);
  ctx.lineTo(52, 16);
  ctx.stroke();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(48, 12);
  ctx.lineTo(56, 20);
  ctx.lineTo(44, 24);
  ctx.closePath();
  ctx.fill();
});

save('cone.png', (ctx) => {
  ctx.fillStyle = 'rgba(251, 191, 36, 0.5)';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 52);
  ctx.lineTo(10, 16);
  ctx.lineTo(54, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
});

save('cube.png', (ctx) => {
  ctx.fillStyle = 'rgba(251, 191, 36, 0.45)';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.fillRect(14, 14, 36, 36);
  ctx.strokeRect(14, 14, 36, 36);
});

save('sphere.png', (ctx) => {
  ctx.fillStyle = 'rgba(251, 191, 36, 0.45)';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(32, 32, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
});

save('pin.png', (ctx) => {
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(32, 22, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(28, 28, 8, 22);
  ctx.fillStyle = '#86efac';
  ctx.beginPath();
  ctx.moveTo(32, 8);
  ctx.lineTo(38, 20);
  ctx.lineTo(26, 20);
  ctx.closePath();
  ctx.fill();
});

console.log('Done.');

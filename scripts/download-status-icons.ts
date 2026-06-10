/**
 * Downloads status effect SVGs from game-icons.net (CC BY 3.0) and tints them.
 * Run: npm run download:status-icons
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/icons/status');

const { STATUS_ICON_SOURCES } = await import(
  pathToFileURL(join(__dirname, '../src/lib/statusIconSources.ts')).href
);

function svgUrl(author: string, slug: string) {
  return `https://game-icons.net/icons/000000/transparent/1x1/${author}/${slug}.svg`;
}

function hexLuminance(hex: string): number {
  const n = (c: string) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = n(hex.slice(1, 3));
  const g = n(hex.slice(3, 5));
  const b = n(hex.slice(5, 7));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Dark status colors need a lighter icon fill to stay visible on map badges. */
function iconFillColor(hex: string): string {
  if (hexLuminance(hex) >= 0.12) return hex;
  return '#94a3b8';
}

function recolorSvg(svg: string, color: string): string {
  const fill = iconFillColor(color);
  return svg
    .replace(/\bfill="#000000"/gi, `fill="${fill}"`)
    .replace(/\bfill="#000"/gi, `fill="${fill}"`)
    .replace(/\bstroke="#000000"/gi, `stroke="${fill}"`)
    .replace(/\bstroke="#000"/gi, `stroke="${fill}"`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  for (const icon of STATUS_ICON_SOURCES) {
    const url = svgUrl(icon.author, icon.slug);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${icon.id}: ${res.status} ${url}`);
    const svg = recolorSvg(await res.text(), icon.color);
    writeFileSync(join(outDir, `${icon.id}.svg`), svg);
    console.log(`Wrote ${icon.id}.svg`);
  }

  const attribution = `# Status effect icons

Icons from [game-icons.net](https://game-icons.net) under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

| File | Icon | Author |
|------|------|--------|
${STATUS_ICON_SOURCES.map(
  (i) =>
    `| ${i.id}.svg | [${i.slug}](https://game-icons.net/1x1/${i.author}/${i.slug}.html) | ${i.authorName} |`,
).join('\n')}

Attribution: Icons by Delapouite, Lorc, sbed, and Skoll. Available on https://game-icons.net
`;

  writeFileSync(join(outDir, 'ATTRIBUTION.md'), attribution);
  console.log('Wrote ATTRIBUTION.md');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

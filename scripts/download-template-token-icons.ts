/**
 * Downloads template token SVGs from game-icons.net (CC BY 3.0).
 * Run: npm run download:template-token-icons
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/icons/template-tokens');

const { TEMPLATE_TOKEN_ICON_SOURCES } = await import(
  pathToFileURL(join(__dirname, '../src/lib/templateTokenIconSources.ts')).href
);

function svgUrl(author: string, slug: string) {
  return `https://game-icons.net/icons/000000/transparent/1x1/${author}/${slug}.svg`;
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  for (const icon of TEMPLATE_TOKEN_ICON_SOURCES) {
    const url = svgUrl(icon.author, icon.slug);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${icon.id}: ${res.status} ${url}`);
    writeFileSync(join(outDir, `${icon.id}.svg`), await res.text());
    console.log(`Wrote ${icon.id}.svg`);
  }

  const attribution = `# Template token icons

Icons from [game-icons.net](https://game-icons.net) under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

| File | Icon | Author |
|------|------|--------|
${TEMPLATE_TOKEN_ICON_SOURCES.map(
  (i) =>
    `| ${i.id}.svg | [${i.slug}](https://game-icons.net/1x1/${i.author}/${i.slug}.html) | ${i.authorName} |`,
).join('\n')}

Attribution: Icons by Delapouite and Lorc. Available on https://game-icons.net
`;

  writeFileSync(join(outDir, 'ATTRIBUTION.md'), attribution);
  console.log('Wrote ATTRIBUTION.md');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

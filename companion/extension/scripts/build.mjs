import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProtocolRoot, protocolResolvePlugin } from './protocolResolvePlugin.mjs';
import { zipDirectory } from './zipDir.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isFirefox = process.argv.includes('--firefox');
const dist = join(root, isFirefox ? 'dist-firefox' : 'dist');
const repoRoot = join(root, '..', '..');
const protocolRoot = getProtocolRoot(root);
const protocolPlugin = protocolResolvePlugin(protocolRoot);

mkdirSync(dist, { recursive: true });

function loadSiteOrigin() {
  try {
    for (const siteConfigPath of [join(root, 'site.config.ts'), join(repoRoot, 'site.config.ts')]) {
      if (!existsSync(siteConfigPath)) continue;
      const source = readFileSync(siteConfigPath, 'utf8');
      const slugMatch = source.match(/SITE_SLUG\s*=\s*['"]([^'"]+)['"]/);
      if (slugMatch) return `https://*.github.io/${slugMatch[1]}/*`;
    }
    return null;
  } catch {
    return null;
  }
}

function injectManifestOrigins() {
  const manifestPath = join(root, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  const localhost = [
    'https://localhost:5173/*',
    'http://localhost:5173/*',
    'https://127.0.0.1:5173/*',
    'http://127.0.0.1:5173/*',
  ];
  /** Chrome/Edge: Vite --host on LAN (e.g. https://192.168.0.19:5173/...) */
  const devLanChrome = ['https://*:5173/*', 'http://*:5173/*'];
  const production = loadSiteOrigin();
  const chromeMatches = production
    ? [...localhost, ...devLanChrome, production]
    : [...localhost, ...devLanChrome];
  // Firefox rejects host wildcards with ports (https://*:5173/*). Dev temp add-on uses <all_urls>.
  const firefoxMatches = production
    ? [...localhost, production, '<all_urls>']
    : [...localhost, '<all_urls>'];

  const matches = isFirefox ? firefoxMatches : chromeMatches;

  if (manifest.content_scripts?.[0]) {
    manifest.content_scripts[0].matches = matches;
  }
  if (manifest.externally_connectable) {
    manifest.externally_connectable.matches = matches;
  }

  if (isFirefox) {
    // Firefox temporary add-ons: service_worker not supported — use background.scripts.
    manifest.background = { scripts: ['background.js'] };
    delete manifest.externally_connectable;
    manifest.browser_specific_settings = {
      gecko: {
        id: 'battle-standard-save@dev',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    };
  }

  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));

  if (isFirefox) {
    const zipPath = join(dist, '..', 'dist-firefox.zip');
    try {
      zipDirectory(dist, zipPath);
      console.log('Firefox AMO package:', zipPath);
      console.log('Submit to https://addons.mozilla.org/developers/ for signing (self-distribution).');
      console.log('Or use Chrome/Edge with companion/extension/dist for unsigned local dev.');
    } catch {
      console.log('[skip] could not create dist-firefox.zip');
    }
  }
}

await Promise.all([
  build({
    entryPoints: [join(root, 'src/background.ts')],
    outfile: join(dist, 'background.js'),
    bundle: true,
    platform: 'browser',
    format: isFirefox ? 'iife' : 'esm',
    target: isFirefox ? 'firefox109' : 'chrome120',
    plugins: [protocolPlugin],
  }),
  build({
    entryPoints: [join(root, 'src/content.ts')],
    outfile: join(dist, 'content.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    plugins: [protocolPlugin],
  }),
]);

injectManifestOrigins();
console.log(
  isFirefox
    ? 'Firefox extension built to companion/extension/dist-firefox'
    : 'Extension built to companion/extension/dist',
);

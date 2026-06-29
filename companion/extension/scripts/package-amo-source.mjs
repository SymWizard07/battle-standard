/**
 * Zip extension source for Mozilla AMO (forward-slash paths, flat layout).
 * Run: node scripts/package-amo-source.mjs
 * Output: companion/extension/dist-firefox-source.zip
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipDirectory } from './zipDir.mjs';

const extRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const companionRoot = join(extRoot, '..');
const repoRoot = join(companionRoot, '..');
const staging = join(extRoot, 'amo-source-staging');
const outZip = join(extRoot, 'dist-firefox-source.zip');

function copyIfExists(src, dest) {
  if (existsSync(src)) cpSync(src, dest, { recursive: true });
}

function copyTypeScriptSources(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    const srcPath = join(srcDir, name);
    if (statSync(srcPath).isDirectory()) continue;
    if (!name.endsWith('.ts')) continue;
    if (name.endsWith('.test.ts')) continue;
    cpSync(srcPath, join(destDir, name));
  }
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

// Flat layout: manifest.json and README at archive root (AMO / reviewer expectation).
copyTypeScriptSources(join(companionRoot, 'protocol'), join(staging, 'protocol'));

const srcDest = join(staging, 'src');
mkdirSync(srcDest, { recursive: true });
for (const name of readdirSync(join(extRoot, 'src'))) {
  if (!name.endsWith('.ts')) continue;
  if (name.endsWith('.test.ts')) continue;
  cpSync(join(extRoot, 'src', name), join(srcDest, name));
}

for (const name of ['scripts', 'manifest.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'README.md']) {
  copyIfExists(join(extRoot, name), join(staging, name));
}

const siteConfig = join(repoRoot, 'site.config.ts');
if (existsSync(siteConfig)) {
  cpSync(siteConfig, join(staging, 'site.config.ts'));
}

zipDirectory(staging, outZip);
rmSync(staging, { recursive: true, force: true });
console.log('AMO source package:', outZip);

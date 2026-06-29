import { accessSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const trayRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  join(trayRoot, 'resources', 'host', 'main.js'),
  join(trayRoot, 'resources', 'host', 'run-host.cmd'),
  join(trayRoot, 'resources', 'host', 'run-host.sh'),
  join(trayRoot, 'dist', 'main.cjs'),
];

let missing = 0;
for (const file of required) {
  try {
    accessSync(file);
    console.log(`OK ${file}`);
  } catch {
    console.error(`MISSING ${file}`);
    missing += 1;
  }
}

if (missing > 0) {
  process.exit(1);
}

console.log('verify-bundle: all tray host artifacts present');

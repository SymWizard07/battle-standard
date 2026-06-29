/**
 * Create a ZIP with forward-slash paths (AMO-compatible).
 * Do NOT use PowerShell Compress-Archive — it uses backslashes and AMO rejects it.
 */
import { execSync } from 'node:child_process';

/** Zip directory contents to zipPath (manifest.json at archive root when dir is dist-firefox). */
export function zipDirectory(sourceDir, zipPath) {
  const src = sourceDir.replace(/\\/g, '/');
  const out = zipPath.replace(/\\/g, '/');
  execSync(`tar -caf "${out}" -C "${src}" .`, { stdio: 'inherit' });
}

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

export type FolderPicker = () => string | null;

const PROMPT = 'Choose Battle Standard save folder';

function normalizePath(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    if (!fs.existsSync(trimmed)) return null;
    const stat = fs.statSync(trimmed);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }
  return trimmed;
}

function pickFolderWindows(): string | null {
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    `$dialog.Description = '${PROMPT.replace(/'/g, "''")}'`,
    '$dialog.ShowNewFolderButton = $true',
    'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  Write-Output $dialog.SelectedPath',
    '}',
  ].join('; ');
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-STA', '-Command', script],
    { encoding: 'utf8', windowsHide: false },
  );
  if (result.error || result.status !== 0) return null;
  return normalizePath(result.stdout);
}

function pickFolderMac(): string | null {
  const script = `POSIX path of (choose folder with prompt "${PROMPT}")`;
  const result = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return normalizePath(result.stdout);
}

function pickFolderLinux(): string | null {
  for (const [cmd, args] of [
    ['zenity', ['--file-selection', '--directory', '--title', PROMPT]],
    ['kdialog', ['--getexistingdirectory', '.', '--title', PROMPT]],
  ] as const) {
    const result = spawnSync(cmd, args, { encoding: 'utf8' });
    if (result.error?.message?.includes('ENOENT')) continue;
    if (result.status !== 0) continue;
    const picked = normalizePath(result.stdout);
    if (picked) return picked;
  }
  return null;
}

export function pickSaveFolder(picker: FolderPicker = defaultFolderPicker): string | null {
  return picker();
}

export function defaultFolderPicker(): string | null {
  switch (process.platform) {
    case 'win32':
      return pickFolderWindows();
    case 'darwin':
      return pickFolderMac();
    case 'linux':
      return pickFolderLinux();
    default:
      return null;
  }
}

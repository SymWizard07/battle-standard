import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getConfigFilePath, type ConfigPathOverrides } from './configPaths.js';

export interface CompanionConfig {
  saveFolder: string | null;
}

export function defaultConfig(): CompanionConfig {
  return { saveFolder: null };
}

function normalizeConfig(raw: unknown): CompanionConfig {
  if (!raw || typeof raw !== 'object') return defaultConfig();
  const value = raw as Partial<CompanionConfig>;
  const saveFolder =
    typeof value.saveFolder === 'string' && value.saveFolder.trim()
      ? value.saveFolder
      : null;
  return { saveFolder };
}

export function loadConfig(overrides: ConfigPathOverrides = {}): CompanionConfig {
  const configPath = getConfigFilePath(overrides);
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return normalizeConfig(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultConfig();
    throw err;
  }
}

export async function saveConfig(
  config: CompanionConfig,
  overrides: ConfigPathOverrides = {},
): Promise<void> {
  const configPath = getConfigFilePath(overrides);
  const dir = path.dirname(configPath);
  await fsPromises.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(configPath)}.tmp-${randomUUID()}`);
  await fsPromises.writeFile(tmp, JSON.stringify(config, null, 2), 'utf8');
  await fsPromises.rename(tmp, configPath);
}

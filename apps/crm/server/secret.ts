import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function resolvePersistentAuthSecret(
  dataDir: string,
  configured?: string,
): string {
  if (configured?.trim()) return configured.trim();
  const resolvedDataDir = path.resolve(dataDir);
  const secretPath = path.join(resolvedDataDir, 'auth-secret');
  try {
    const existing = readFileSync(secretPath, 'utf8').trim();
    if (existing) return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  mkdirSync(resolvedDataDir, { recursive: true });
  const generated = randomBytes(48).toString('base64url');
  try {
    writeFileSync(secretPath, `${generated}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    return generated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = readFileSync(secretPath, 'utf8').trim();
    if (!existing) {
      throw new Error(`CRM auth secret is empty: ${secretPath}`, {
        cause: error,
      });
    }
    return existing;
  }
}

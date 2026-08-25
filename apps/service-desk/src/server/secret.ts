import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function resolvePersistentAuthSecret(
  dataDir: string,
  configured?: string,
): string {
  if (configured?.trim()) return configured.trim();
  const file = path.join(path.resolve(dataDir), 'auth-secret');
  try {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const generated = randomBytes(48).toString('base64url');
  try {
    writeFileSync(file, `${generated}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    return generated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = readFileSync(file, 'utf8').trim();
    if (!existing)
      throw new Error(`Service desk auth secret is empty: ${file}`, {
        cause: error,
      });
    return existing;
  }
}

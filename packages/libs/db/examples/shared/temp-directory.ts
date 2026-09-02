import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function createExampleTempDirectory(
  prefix: string,
): Promise<string> {
  const root = fileURLToPath(new URL('../tmp/', import.meta.url));
  await mkdir(root, { recursive: true });
  return mkdtemp(path.join(root, prefix));
}

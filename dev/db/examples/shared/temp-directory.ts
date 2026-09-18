import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function createExampleTempDirectory(
  prefix: string,
  root: string = defaultExampleTempDirectoryRoot(),
): Promise<string> {
  await mkdir(root, { recursive: true });
  return mkdtemp(path.join(root, prefix));
}

export async function cleanExampleTempDirectories(
  root: string = defaultExampleTempDirectoryRoot(),
): Promise<number> {
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) =>
      rm(path.join(root, entry.name), { recursive: true, force: true }),
    ),
  );
  return entries.length;
}

function defaultExampleTempDirectoryRoot(): string {
  return fileURLToPath(new URL('../tmp/', import.meta.url));
}

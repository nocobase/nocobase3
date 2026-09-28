import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectPackageManager } from '../src/lib/package-manager.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createDirectory(lockfile?: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nb3-pm-test-'));
  created.push(directory);

  if (lockfile) {
    await writeFile(path.join(directory, lockfile), '', 'utf8');
  }

  return directory;
}

describe('detectPackageManager', () => {
  it('honours the packageManager field before looking at disk', async () => {
    const directory = await createDirectory('pnpm-lock.yaml');

    expect(await detectPackageManager(directory, 'yarn@4.0.0')).toBe('yarn');
  });

  it('ignores a packageManager field naming something unknown', async () => {
    const directory = await createDirectory('yarn.lock');

    expect(await detectPackageManager(directory, 'bun@1.0.0')).toBe('yarn');
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ])('detects %s as %s', async (lockfile, expected) => {
    expect(await detectPackageManager(await createDirectory(lockfile))).toBe(
      expected,
    );
  });

  it('falls back to pnpm, which is what the templates use', async () => {
    expect(await detectPackageManager(await createDirectory())).toBe('pnpm');
  });
});

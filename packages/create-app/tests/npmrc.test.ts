import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ensureScopedNocoBaseRegistry } from '../src/lib/npmrc.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'create-app-npmrc-'));
  created.push(directory);
  return directory;
}

describe('ensureScopedNocoBaseRegistry', () => {
  it('preserves template settings and scopes only NocoBase packages', async () => {
    const directory = await createTempDirectory();
    await writeFile(
      path.join(directory, '.npmrc'),
      'strict-peer-dependencies=false\n',
      'utf8',
    );

    await ensureScopedNocoBaseRegistry(directory, 'https://npm.nocobase.ai/');

    const contents = await readFile(path.join(directory, '.npmrc'), 'utf8');
    expect(contents).toContain('strict-peer-dependencies=false');
    expect(contents).toContain('@nocobase:registry=https://npm.nocobase.ai');
    expect(contents).not.toContain('\nregistry=');
  });

  it('updates one existing entry and is idempotent', async () => {
    const directory = await createTempDirectory();
    await writeFile(
      path.join(directory, '.npmrc'),
      [
        '@nocobase:registry=https://old.example.com',
        '@nocobase:registry=https://duplicate.example.com',
        '',
      ].join('\n'),
      'utf8',
    );

    await ensureScopedNocoBaseRegistry(directory, 'https://npm.nocobase.ai');
    const first = await readFile(path.join(directory, '.npmrc'), 'utf8');
    await ensureScopedNocoBaseRegistry(directory, 'https://npm.nocobase.ai');

    expect(await readFile(path.join(directory, '.npmrc'), 'utf8')).toBe(first);
    expect(first.match(/@nocobase:registry=/gu)).toHaveLength(1);
  });

  it('rejects credentials embedded in a persisted registry', async () => {
    const directory = await createTempDirectory();

    await expect(
      ensureScopedNocoBaseRegistry(
        directory,
        'https://user:secret@npm.example.com',
      ),
    ).rejects.toThrow('without embedded credentials');
  });
});

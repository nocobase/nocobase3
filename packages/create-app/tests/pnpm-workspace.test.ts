import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAllowBuildsYaml,
  ensureAllowBuilds,
  PNPM_WORKSPACE_FILE,
} from '../src/lib/pnpm-workspace.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'create-app-workspace-'),
  );
  created.push(directory);

  return directory;
}

async function readWorkspace(directory: string): Promise<string> {
  return readFile(path.join(directory, PNPM_WORKSPACE_FILE), 'utf8');
}

describe('buildAllowBuildsYaml', () => {
  it('lists only drivers that compile a native addon', () => {
    const yaml = buildAllowBuildsYaml(['better-sqlite3']);

    expect(yaml).toContain('allowBuilds:');
    expect(yaml).toContain('  better-sqlite3: true');
  });

  it('produces nothing for pure JavaScript drivers', () => {
    expect(buildAllowBuildsYaml(['pg'])).toBe('');
    expect(buildAllowBuildsYaml(['mysql2'])).toBe('');
  });
});

describe('ensureAllowBuilds', () => {
  /**
   * pnpm 11 skips a dependency's install script unless it is listed here, and reads the list from this file alone.
   * Without the entry `better-sqlite3` installs without its native addon and the app fails at its first query.
   */
  it('creates the file for a native driver', async () => {
    const directory = await createTempDirectory();

    await ensureAllowBuilds(directory, ['better-sqlite3']);

    expect(await readWorkspace(directory)).toContain('better-sqlite3: true');
  });

  it('writes no file when no driver needs building', async () => {
    const directory = await createTempDirectory();

    await ensureAllowBuilds(directory, ['pg']);

    await expect(readWorkspace(directory)).rejects.toThrow();
  });

  /**
   * The template ships its own copy of this file, generated at pack time. Overwriting it would drop whatever settings
   * the template deliberately set, so an existing `allowBuilds` block is merged into rather than replaced.
   */
  it('merges into an existing allowBuilds block', async () => {
    const directory = await createTempDirectory();

    await writeFile(
      path.join(directory, PNPM_WORKSPACE_FILE),
      'allowBuilds:\n  esbuild: true\n',
      'utf8',
    );
    await ensureAllowBuilds(directory, ['better-sqlite3']);

    const contents = await readWorkspace(directory);

    expect(contents).toContain('esbuild: true');
    expect(contents).toContain('better-sqlite3: true');
    expect(contents.match(/allowBuilds:/gu)).toHaveLength(1);
  });

  it('preserves unrelated settings when appending a new block', async () => {
    const directory = await createTempDirectory();

    await writeFile(
      path.join(directory, PNPM_WORKSPACE_FILE),
      'packages:\n  - packages/*\n',
      'utf8',
    );
    await ensureAllowBuilds(directory, ['better-sqlite3']);

    const contents = await readWorkspace(directory);

    expect(contents).toContain('packages:');
    expect(contents).toContain('  - packages/*');
    expect(contents).toContain('better-sqlite3: true');
  });

  it('is idempotent', async () => {
    const directory = await createTempDirectory();

    await ensureAllowBuilds(directory, ['better-sqlite3']);
    const first = await readWorkspace(directory);

    await ensureAllowBuilds(directory, ['better-sqlite3']);

    expect(await readWorkspace(directory)).toBe(first);
    expect(first.match(/better-sqlite3: true/gu)).toHaveLength(1);
  });

  it('replaces an empty file rather than appending to it', async () => {
    const directory = await createTempDirectory();

    await writeFile(path.join(directory, PNPM_WORKSPACE_FILE), '\n\n', 'utf8');
    await ensureAllowBuilds(directory, ['better-sqlite3']);

    const contents = await readWorkspace(directory);

    expect(contents.startsWith('\n')).toBe(false);
    expect(contents).toContain('better-sqlite3: true');
  });
});

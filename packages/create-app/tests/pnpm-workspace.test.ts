import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ALLOWED_BUILDS,
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

describe('ALLOWED_BUILDS', () => {
  it('covers the packages a generated app needs to build', () => {
    expect(ALLOWED_BUILDS).toContain('@nocobase/app-portal-sdk');
    expect(ALLOWED_BUILDS).toContain('better-sqlite3');
    expect(ALLOWED_BUILDS).toContain('esbuild');
  });
});

describe('buildAllowBuildsYaml', () => {
  it('lists every entry under a single allowBuilds key', () => {
    const yaml = buildAllowBuildsYaml();

    expect(yaml).toContain('allowBuilds:');
    expect(yaml.match(/allowBuilds:/gu)).toHaveLength(1);

    for (const name of ALLOWED_BUILDS) {
      expect(yaml).toContain(name);
    }
  });

  /** A leading `@` starts a reserved indicator in YAML, so a scoped name has to be quoted to parse. */
  it('quotes scoped names', () => {
    expect(buildAllowBuildsYaml()).toContain(
      "  '@nocobase/app-portal-sdk': true",
    );
    expect(buildAllowBuildsYaml()).toContain('  better-sqlite3: true');
  });

  it('produces nothing for an empty list', () => {
    expect(buildAllowBuildsYaml([])).toBe('');
  });
});

describe('ensureAllowBuilds', () => {
  /**
   * pnpm 11 skips a dependency's install script unless it is listed here, and reads the list from this file alone.
   * Without it `better-sqlite3` installs without its native addon and the app fails at its first query.
   */
  it('writes every entry regardless of the database chosen', async () => {
    const directory = await createTempDirectory();

    await ensureAllowBuilds(directory);

    const contents = await readWorkspace(directory);

    for (const name of ALLOWED_BUILDS) {
      expect(contents).toContain(name);
    }
  });

  /**
   * `better-sqlite3` is only installed for sqlite, but listing it anyway means switching an existing app to sqlite
   * later just works instead of failing with an error that names nothing actionable.
   */
  it('lists better-sqlite3 even when it is not installed yet', async () => {
    const directory = await createTempDirectory();

    await ensureAllowBuilds(directory);

    expect(await readWorkspace(directory)).toContain('better-sqlite3: true');
  });

  /**
   * A template may ship its own file. Overwriting it would drop whatever settings it deliberately set, so an existing
   * `allowBuilds` block is merged into rather than replaced.
   */
  it('merges into an existing allowBuilds block', async () => {
    const directory = await createTempDirectory();

    await writeFile(
      path.join(directory, PNPM_WORKSPACE_FILE),
      'allowBuilds:\n  sharp: true\n',
      'utf8',
    );
    await ensureAllowBuilds(directory);

    const contents = await readWorkspace(directory);

    expect(contents).toContain('sharp: true');
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
    await ensureAllowBuilds(directory);

    const contents = await readWorkspace(directory);

    expect(contents).toContain('packages:');
    expect(contents).toContain('  - packages/*');
    expect(contents).toContain('better-sqlite3: true');
  });

  it('is idempotent', async () => {
    const directory = await createTempDirectory();

    await ensureAllowBuilds(directory);
    const first = await readWorkspace(directory);

    await ensureAllowBuilds(directory);

    expect(await readWorkspace(directory)).toBe(first);
    expect(first.match(/better-sqlite3: true/gu)).toHaveLength(1);
  });

  /** An entry the template wrote unquoted must not be added a second time in quoted form, or the key would repeat. */
  it('recognizes an existing scoped entry however it was quoted', async () => {
    const directory = await createTempDirectory();

    await writeFile(
      path.join(directory, PNPM_WORKSPACE_FILE),
      'allowBuilds:\n  "@nocobase/app-portal-sdk": true\n',
      'utf8',
    );
    await ensureAllowBuilds(directory);

    const contents = await readWorkspace(directory);

    expect(contents.match(/@nocobase\/app-portal-sdk/gu)).toHaveLength(1);
  });

  it('replaces an empty file rather than appending to it', async () => {
    const directory = await createTempDirectory();

    await writeFile(path.join(directory, PNPM_WORKSPACE_FILE), '\n\n', 'utf8');
    await ensureAllowBuilds(directory);

    const contents = await readWorkspace(directory);

    expect(contents.startsWith('\n')).toBe(false);
    expect(contents).toContain('better-sqlite3: true');
  });
});

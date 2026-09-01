import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ALLOWED_BUILDS,
  buildAllowBuildsYaml,
  buildWorkspaceYaml,
  ensureAllowBuilds,
  PNPM_WORKSPACE_FILE,
  WORKSPACE_SETTINGS,
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
    expect(ALLOWED_BUILDS).toContain('better-sqlite3');
    expect(ALLOWED_BUILDS).toContain('oracledb');
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
    expect(buildAllowBuildsYaml(['@scope/native-addon'])).toContain(
      "  '@scope/native-addon': true",
    );
    expect(buildAllowBuildsYaml()).toContain('  better-sqlite3: true');
    expect(buildAllowBuildsYaml()).toContain('  oracledb: true');
  });

  it('produces nothing for an empty list', () => {
    expect(buildAllowBuildsYaml([])).toBe('');
  });
});

describe('buildWorkspaceYaml', () => {
  /**
   * The supply-chain pass re-applies `minimumReleaseAge` and `trustPolicy` to every lockfile entry on every install,
   * querying registry metadata for each one. On a tree this size that costs tens of seconds to re-verify versions the
   * lockfile already pins.
   */
  it('turns off re-auditing the lockfile on every install', () => {
    const yaml = buildWorkspaceYaml();

    expect(yaml).toContain('trustLockfile: true');
  });

  it('explains each setting it writes', () => {
    const yaml = buildWorkspaceYaml();

    for (const setting of WORKSPACE_SETTINGS) {
      expect(yaml).toContain(`${setting.key}: ${setting.value}`);
      // A bare flag nobody can evaluate later is worse than no flag, so each carries its reasoning.
      expect(setting.comment.length).toBeGreaterThan(0);
      for (const line of setting.comment) {
        expect(line.startsWith('#')).toBe(true);
      }
    }
  });

  /** Settings are top level, not nested under `allowBuilds`, or pnpm would read them as package entries. */
  it('keeps settings at the top level', () => {
    for (const line of buildWorkspaceYaml().split('\n')) {
      for (const setting of WORKSPACE_SETTINGS) {
        if (line.includes(`${setting.key}:`)) {
          expect(line.startsWith(' ')).toBe(false);
        }
      }
    }
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

  it('writes the workspace settings alongside the build list', async () => {
    const directory = await createTempDirectory();

    await ensureAllowBuilds(directory);

    expect(await readWorkspace(directory)).toContain('trustLockfile: true');
  });

  /** A template that already set one made a deliberate choice, which must not be overwritten. */
  it('leaves a setting the template already made', async () => {
    const directory = await createTempDirectory();

    await writeFile(
      path.join(directory, PNPM_WORKSPACE_FILE),
      'trustLockfile: false\n',
      'utf8',
    );
    await ensureAllowBuilds(directory);

    const contents = await readWorkspace(directory);

    expect(contents).toContain('trustLockfile: false');
    expect(contents).not.toContain('trustLockfile: true');
  });

  it('appends missing settings to a file that has only allowBuilds', async () => {
    const directory = await createTempDirectory();

    await writeFile(
      path.join(directory, PNPM_WORKSPACE_FILE),
      'allowBuilds:\n  esbuild: true\n',
      'utf8',
    );
    await ensureAllowBuilds(directory);

    const contents = await readWorkspace(directory);

    expect(contents).toContain('trustLockfile: true');
    expect(contents).toContain('esbuild: true');
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
      'allowBuilds:\n  "@scope/native-addon": true\n',
      'utf8',
    );
    await ensureAllowBuilds(directory, ['@scope/native-addon']);

    const contents = await readWorkspace(directory);

    expect(contents.match(/@scope\/native-addon/gu)).toHaveLength(1);
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

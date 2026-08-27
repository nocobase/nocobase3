import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pullHubSource = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/hub-source.ts', () => ({ pullHubSource }));

import { createApp } from '../src/create.ts';

const HUB = 'https://hub.example.com/hub';
let root: string;
let previousCwd: string;
let previousPath: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'create-app-hub-'));
  previousCwd = process.cwd();
  previousPath = process.env.PATH;
  process.chdir(root);
  pullHubSource.mockReset();
});

afterEach(async () => {
  process.chdir(previousCwd);
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
  await rm(root, { force: true, recursive: true });
});

describe('create an existing Hub app', () => {
  it('pulls the Hub source without downloading a template and prepares local development files', async () => {
    pullHubSource.mockImplementation(seedPulledSource);
    const target = path.join(root, 'nested', 'sales');

    const result = await runCreate([
      target,
      '--hub',
      HUB,
      '--app',
      'sales',
      '--db-dialect',
      'sqlite',
      '--no-install',
      '--template',
      '/this/template/must/not/be/read',
    ]);

    expect(result).toBe(0);
    expect(pullHubSource).toHaveBeenCalledWith(
      expect.objectContaining({
        app: 'sales',
        hub: HUB,
        targetDirectory: expect.stringMatching(/\.sales-create-/u),
      }),
    );
    const manifest = JSON.parse(
      await readFile(path.join(target, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      name?: string;
      packageManager?: string;
    };
    expect(manifest.name).toBe('@example/sales');
    expect(manifest.packageManager).toBe('pnpm@11.7.0');
    expect(manifest.dependencies?.['better-sqlite3']).toBe('^12.11.1');
    const env = await readFile(path.join(target, '.env.local'), 'utf8');
    expect(env).toContain('APP_BASE_PATH=/main');
    expect(env).toContain('DB_MIGRATIONS_AUTO_RUN=true');
    expect(env).toContain('DB_DIALECT=sqlite');
    expect(env).toMatch(/^AUTH_SECRET=.+$/mu);
    expect(
      await readFile(path.join(target, 'pnpm-workspace.yaml'), 'utf8'),
    ).toContain('better-sqlite3: true');
    const gitignore = await readFile(path.join(target, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.env.local');
    expect(gitignore).toContain('/.nocobase/');
    expect(gitignore.match(/^\/.nb3\/$/gmu)).toHaveLength(1);
  });

  it('defaults a non-interactive Hub working copy to SQLite', async () => {
    pullHubSource.mockImplementation(seedPulledSource);
    const target = path.join(root, 'sales');

    expect(
      await runCreate([target, '--hub', HUB, '--app', 'sales', '--no-install']),
    ).toBe(0);

    const env = await readFile(path.join(target, '.env.local'), 'utf8');
    expect(env).toContain('DB_DIALECT=sqlite');
    expect(env).toContain('DB_DATABASE=database.sqlite');
  });

  it('removes a partial target when the Hub pull fails', async () => {
    const target = path.join(root, 'sales');
    pullHubSource.mockImplementation(async ({ targetDirectory }) => {
      await writeFile(path.join(targetDirectory, 'partial.txt'), 'partial');
      throw new Error('Hub pull failed.');
    });

    expect(await runCreate(hubArguments(target, ['--no-install']))).toBe(1);
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves a pre-existing empty target when the Hub pull fails', async () => {
    const target = path.join(root, 'sales');
    await mkdir(target);
    pullHubSource.mockImplementation(async ({ targetDirectory }) => {
      await writeFile(path.join(targetDirectory, 'partial.txt'), 'partial');
      throw new Error('Hub pull failed.');
    });

    expect(await runCreate(hubArguments(target, ['--no-install']))).toBe(1);
    expect(await readdir(target)).toEqual([]);
  });

  it('replaces a pre-existing empty target only after preparation succeeds', async () => {
    const target = path.join(root, 'sales');
    await mkdir(target);
    pullHubSource.mockImplementation(seedPulledSource);

    expect(await runCreate(hubArguments(target, ['--no-install']))).toBe(0);
    expect(
      JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8')),
    ).toMatchObject({ name: '@example/sales' });
  });

  it('removes pulled source when local preparation fails', async () => {
    const target = path.join(root, 'sales');
    pullHubSource.mockImplementation(async ({ targetDirectory }) => {
      await writeFile(path.join(targetDirectory, 'package.json'), '{invalid');
    });

    expect(await runCreate(hubArguments(target, ['--no-install']))).toBe(1);
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('installs dependencies after pulling and cleans up an install failure', async () => {
    const target = path.join(root, 'sales');
    pullHubSource.mockImplementation(seedPulledSource);
    const bin = path.join(root, 'bin');
    await mkdir(bin);
    await writeFile(path.join(bin, 'pnpm'), '#!/bin/sh\nexit 17\n', {
      mode: 0o700,
    });
    process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ''}`;

    expect(await runCreate(hubArguments(target))).toBe(1);
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('runs pnpm install after a successful Hub pull by default', async () => {
    const target = path.join(root, 'sales');
    const invocation = path.join(root, 'pnpm-invocation.json');
    pullHubSource.mockImplementation(seedPulledSource);
    const bin = path.join(root, 'bin');
    await mkdir(bin);
    await writeFile(
      path.join(bin, 'pnpm'),
      `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(invocation)}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));
`,
      { mode: 0o700 },
    );
    process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ''}`;

    expect(
      await runCreate([
        target,
        '--hub',
        HUB,
        '--app',
        'sales',
        '--db-dialect',
        'postgres',
      ]),
    ).toBe(0);
    expect(JSON.parse(await readFile(invocation, 'utf8'))).toEqual({
      argv: ['install', '--registry=https://npm.nocobase.ai'],
      cwd: expect.stringMatching(/\.sales-create-/u),
    });
    expect(await realpath(target)).toBeTruthy();
    await expect(stat(target)).resolves.toBeTruthy();
  });
});

async function runCreate(argv: string[]): Promise<number> {
  return createApp({ argv, binary: 'create-app', version: '0.0.0-test' });
}

function hubArguments(target: string, extra: string[] = []): string[] {
  return [
    target,
    '--hub',
    HUB,
    '--app',
    'sales',
    '--db-dialect',
    'sqlite',
    ...extra,
  ];
}

async function seedPulledSource(options: {
  targetDirectory: string;
}): Promise<void> {
  await mkdir(path.join(options.targetDirectory, '.nocobase'), {
    recursive: true,
  });
  await writeFile(
    path.join(options.targetDirectory, 'package.json'),
    `${JSON.stringify({
      name: '@example/sales',
      dependencies: { knex: '^3.1.0' },
      scripts: { dev: 'node server.js' },
    })}\n`,
  );
  await writeFile(
    path.join(options.targetDirectory, '.env.example'),
    'APP_BASE_PATH=/main\nDB_MIGRATIONS_AUTO_RUN=true\n',
  );
  await writeFile(
    path.join(options.targetDirectory, '.gitignore'),
    'node_modules/\n.env.local\n/.nb3/\n',
  );
  await writeFile(
    path.join(options.targetDirectory, '.nocobase', 'config.json'),
    `${JSON.stringify({ applicationId: 'app-1', hub: HUB, slug: 'sales' })}\n`,
  );
}

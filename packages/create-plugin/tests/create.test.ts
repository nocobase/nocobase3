import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCreatePluginCli } from '../src/create.ts';

const created: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('runCreatePluginCli', () => {
  it('prints a stable, read-only JSON generation plan', async () => {
    const repoRoot = await mkdtemp(
      path.join(os.tmpdir(), 'create-plugin-cli-'),
    );
    created.push(repoRoot);
    await mkdir(path.join(repoRoot, 'packages'));
    const output: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk): boolean => {
      output.push(String(chunk));
      return true;
    });

    await expect(
      runCreatePluginCli({
        argv: [
          'audit-log',
          '--with',
          'server.routes',
          '--with',
          'skills',
          '--dry-run',
          '--json',
        ],
        binary: 'pnpm plugin:create',
        repoRoot,
        version: '0.0.1',
      }),
    ).resolves.toBe(0);

    const result = JSON.parse(output.join('')) as {
      schemaVersion: number;
      mode: string;
      requestedCapabilities: string[];
      capabilities: { server: { routes: boolean }; skills: boolean };
      derivedStructure: { clientPlugin: boolean; serverPlugin: boolean };
      files: Array<{ path: string; reason: string }>;
      writes: string[];
      commands: string[];
    };
    expect(result).toMatchObject({
      schemaVersion: 1,
      mode: 'dry-run',
      requestedCapabilities: ['server.routes', 'skills'],
      capabilities: { server: { routes: true }, skills: true },
      derivedStructure: { clientPlugin: false, serverPlugin: true },
      writes: [],
      commands: [],
    });
    expect(result.files).toContainEqual({
      path: 'server/routes/index.ts',
      reason: 'server.routes',
    });
    expect(result.files).toContainEqual({
      path: 'skills/nocobase-app-plugin-audit-log/SKILL.md',
      reason: 'skills',
    });
    await expect(
      readFile(
        path.join(repoRoot, 'packages/app-plugin-audit-log/package.json'),
        'utf8',
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    const createRepoRoot = await mkdtemp(
      path.join(os.tmpdir(), 'create-plugin-cli-'),
    );
    created.push(createRepoRoot);
    await mkdir(path.join(createRepoRoot, 'packages'));
    output.length = 0;

    await expect(
      runCreatePluginCli({
        argv: [
          'audit-log',
          '--with',
          'server.routes',
          '--with',
          'skills',
          '--no-install',
          '--json',
        ],
        binary: 'pnpm plugin:create',
        repoRoot: createRepoRoot,
        version: '0.0.1',
      }),
    ).resolves.toBe(0);

    const createResult = JSON.parse(output.join('')) as {
      mode: string;
      requestedCapabilities: string[];
      capabilities: unknown;
      derivedStructure: unknown;
      files: Array<{ path: string; reason: string }>;
      writes: string[];
      commands: string[];
    };
    expect(createResult).toMatchObject({
      mode: 'create',
      requestedCapabilities: result.requestedCapabilities,
      capabilities: result.capabilities,
      derivedStructure: result.derivedStructure,
      files: result.files,
      writes: result.files.map((file) => file.path),
      commands: [],
    });
  });
});

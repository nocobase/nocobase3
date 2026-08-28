// @vitest-environment node

import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packageRoot } from './helpers.ts';

const execFileAsync = promisify(execFile);

let temporaryDirectory: string;
let packedPackage: string;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-cli-pack-smoke-'),
  );
  const archive = path.join(temporaryDirectory, 'nocobase-cli.tgz');
  const extracted = path.join(temporaryDirectory, 'extracted');

  await execFileAsync(
    process.execPath,
    [path.join(packageRoot, 'scripts/build.mjs')],
    {
      cwd: packageRoot,
    },
  );
  await execFileAsync(
    'pnpm',
    ['--config.ignore-scripts=true', 'pack', '--out', archive],
    { cwd: packageRoot },
  );
  await mkdir(extracted);
  await execFileAsync('tar', ['-xzf', archive, '-C', extracted]);

  packedPackage = path.join(extracted, 'package');
  await symlink(
    path.join(packageRoot, 'node_modules'),
    path.join(packedPackage, 'node_modules'),
    'dir',
  );
}, 60_000);

afterAll(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

describe('packed CLI command surfaces', () => {
  it('ships executable nb3 and nocobase-app bins with compiled commands', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(packedPackage, 'package.json'), 'utf8'),
    ) as { bin?: Record<string, string> };

    expect(manifest.bin).toEqual({
      nb3: './bin/run.js',
      'nocobase-app': './bin/app.js',
    });
    await access(path.join(packedPackage, 'bin/run.js'), constants.X_OK);
    await access(path.join(packedPackage, 'bin/app.js'), constants.X_OK);
    await access(path.join(packedPackage, 'dist/commands/hub/login.js'));
    await access(path.join(packedPackage, 'dist/app-scripts/hub/login.js'));
    await access(path.join(packedPackage, 'dist/app-scripts/release.js'));
  });

  it('runs both packed bins without loading source files', async () => {
    const nb3 = await runPackedBin('bin/run.js', ['--help']);
    expect(nb3.stderr).toBe('');
    expect(nb3.stdout).toContain('$ nb3 [COMMAND]');

    const app = await runPackedBin('bin/app.js', ['--help']);
    expect(app.stderr).toBe('');
    expect(app.stdout).toContain('$ pnpm run [COMMAND]');
    expect(app.stdout).toContain('release');
    expect(app.stdout).not.toContain('MODULE_NOT_FOUND');
  });

  it.each(['hub:login', 'hub:logout', 'release'])(
    'renders the packed %s command with its package-script ID and examples',
    async (commandId) => {
      const result = await runPackedBin('bin/app.js', [commandId, '--help']);

      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(`$ pnpm run ${commandId}`);
      expect(result.stdout).toContain('EXAMPLES');
      expect(result.stdout).not.toContain('MODULE_NOT_FOUND');
    },
  );

  it('does not expose deployment through the packed release command', async () => {
    const help = await runPackedBin('bin/app.js', ['release', '--help']);
    expect(help.stdout).not.toContain('--deploy');

    const failed = await runPackedBin('bin/app.js', ['release', '--deploy']);
    expect(failed.exitCode).toBe(2);
    expect(failed.stderr).toContain('Nonexistent flag: --deploy');
  });

  it('prints a resumable release command from the packed app surface', async () => {
    const emptyAppDirectory = path.join(temporaryDirectory, 'empty-app');
    await mkdir(emptyAppDirectory);

    const result = await runPackedBin(
      'bin/app.js',
      ['release', '--non-interactive'],
      emptyAppDirectory,
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(
      /Next: pnpm run release --operation-id [0-9a-f-]+ --non-interactive/,
    );
    expect(result.stderr).not.toContain('MODULE_NOT_FOUND');
  });
});

async function runPackedBin(
  relativeBin: string,
  argv: readonly string[],
  cwd: string = packedPackage,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync(
      process.execPath,
      [path.join(packedPackage, relativeBin), ...argv],
      {
        cwd,
        env: { ...process.env, NB3_CLI_USE_DIST: '1' },
      },
    );
    return { ...result, exitCode: 0 };
  } catch (error) {
    const failure = error as Error & {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message,
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
    };
  }
}

import type { Config } from '@oclif/core';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadAppScriptTestConfig,
  packageRoot,
  runCommandAllowFailure,
} from './helpers.ts';

const EXPECTED_SCRIPT_IDS = [
  'deploy',
  'hub:login',
  'hub:logout',
  'release',
  'status',
];
const execFileAsync = promisify(execFile);

let config: Config;

beforeAll(async () => {
  config = await loadAppScriptTestConfig();
});

describe('generated app package scripts', () => {
  it('loads deploy from source through the app executable', async () => {
    const result = await execFileAsync(
      process.execPath,
      [path.join(packageRoot, 'bin/app.js'), 'deploy', '--help'],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          NB3_CLI_USE_DIST: '0',
          NODE_ENV: 'production',
          NODE_OPTIONS: '',
        },
      },
    );

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('$ pnpm run deploy');
  });

  it('exposes only the Hub workflows implemented for package scripts', () => {
    expect([...config.commandIDs].sort()).toEqual(EXPECTED_SCRIPT_IDS);
  });

  it('renders commands as pnpm scripts instead of nb3 commands', () => {
    expect(config.bin).toBe('pnpm run');

    for (const id of EXPECTED_SCRIPT_IDS) {
      const command = config.findCommand(id, { must: true });

      expect(command.summary, `${id} has no summary`).toBeTruthy();
      expect(command.examples?.length, `${id} has no examples`).toBeGreaterThan(
        0,
      );
    }
  });

  it('keeps release separate from deployment', async () => {
    const release = config.findCommand('release', { must: true });
    const ReleaseCommand = await release.load();

    expect(ReleaseCommand.flags).not.toHaveProperty('deploy');

    const failed = await runCommandAllowFailure(config, 'release', [
      '--deploy',
    ]);
    expect(failed.error).toMatchObject({ oclif: { exit: 2 } });
    expect((failed.error as Error).message).toMatch(/--deploy/u);
  });

  it('lets release and deploy bind an existing Hub app', () => {
    for (const id of ['release', 'deploy']) {
      const command = config.findCommand(id, { must: true });

      expect(command.flags).toHaveProperty('app');
    }
  });

  it('keeps nb3 while publishing the app-script executable', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as {
      bin?: Record<string, string>;
      oclif?: {
        bin?: string;
        commands?: { target?: string };
        dirname?: string;
        topics?: Record<string, unknown>;
      };
    };

    expect(manifest.bin).toEqual({
      nb3: './bin/run.js',
      'nocobase-app': './bin/app.js',
    });
    expect(manifest.oclif).toMatchObject({
      bin: 'nb3',
      commands: { target: './dist/commands' },
      dirname: 'nb3',
    });
    expect(manifest.oclif?.topics).toEqual({
      app: expect.any(Object),
      'app:plugin': expect.any(Object),
      'app:plugin:skills': expect.any(Object),
      hub: expect.any(Object),
    });
  });
});

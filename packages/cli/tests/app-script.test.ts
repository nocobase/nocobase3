import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyAddress, resolveAppScript } from '../src/lib/app-script.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

interface AppOptions {
  scripts?: Record<string, string>;
  packageManager?: string;
  lockfile?: string;
}

async function createApp(options: AppOptions = {}): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nb3-app-script-'));
  created.push(directory);

  await mkdir(path.join(directory, '.nb3'), { recursive: true });
  await writeFile(
    path.join(directory, '.nb3', 'config.json'),
    JSON.stringify({
      hub: undefined,
      name: 'crm',
      template: '@nocobase/app-template-default',
      templateVersion: '0.0.1',
    }),
    'utf8',
  );
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'crm',
      packageManager: options.packageManager,
      scripts: options.scripts ?? { build: 'x', dev: 'x', start: 'x' },
    }),
    'utf8',
  );

  if (options.lockfile) {
    await writeFile(path.join(directory, options.lockfile), '', 'utf8');
  }

  return directory;
}

describe('resolveAppScript', () => {
  it('runs the requested script through the detected package manager', async () => {
    const directory = await createApp({ lockfile: 'yarn.lock' });
    const plan = await resolveAppScript({ dir: directory, script: 'build' });

    expect(plan.packageManager).toBe('yarn');
    expect(plan.args).toEqual(['run', 'build']);
    expect(plan.project.config.name).toBe('crm');
  });

  it('refuses a script the app does not declare, naming the app', async () => {
    const directory = await createApp({ scripts: { dev: 'x' } });

    await expect(
      resolveAppScript({ dir: directory, script: 'start' }),
    ).rejects.toThrow(/"crm" has no start script/);
  });

  /**
   * The address travels in the environment, never on the command line: `pnpm run dev -- --port 3100` hands the script a
   * literal `--` that npm and yarn swallow, so forwarding through a package manager is not portable.
   */
  it('carries the address in the environment rather than on the command line', async () => {
    const directory = await createApp();
    const plan = await resolveAppScript({
      address: { host: '0.0.0.0', port: 3100 },
      dir: directory,
      script: 'start',
    });

    expect(plan.args).toEqual(['run', 'start']);
    expect(plan.env).toMatchObject({
      APP_SERVER_HOST: '0.0.0.0',
      APP_SERVER_PORT: '3100',
    });
  });

  it('reports a missing app rather than assuming the working directory', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nb3-not-an-app-'));
    created.push(directory);

    await expect(
      resolveAppScript({ dir: directory, script: 'dev' }),
    ).rejects.toThrow(/No app found/);
  });
});

/**
 * Templates disagree on which variable carries the address, so both conventions are set. A template reading only one
 * of them still gets the port the user asked for.
 */
describe('applyAddress', () => {
  it('sets both the app-server and the generic variables', () => {
    const env = applyAddress({ PATH: '/usr/bin' }, { host: '::', port: 3100 });

    expect(env).toMatchObject({
      APP_SERVER_HOST: '::',
      APP_SERVER_PORT: '3100',
      HOST: '::',
      PATH: '/usr/bin',
      PORT: '3100',
    });
  });

  it('leaves an unset part of the address alone rather than blanking it', () => {
    const env = applyAddress(
      { APP_SERVER_HOST: '127.0.0.1', APP_SERVER_PORT: '13000' },
      { port: 3100 },
    );

    expect(env.APP_SERVER_HOST).toBe('127.0.0.1');
    expect(env.APP_SERVER_PORT).toBe('3100');
  });

  it('passes the environment through untouched when no address was given', () => {
    const env = applyAddress({ APP_SERVER_PORT: '13000' });

    expect(env).toEqual({ APP_SERVER_PORT: '13000' });
  });
});

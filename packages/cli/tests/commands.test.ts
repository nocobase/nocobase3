import type { Config } from '@oclif/core';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadTestConfig,
  runCommand,
  runCommandAllowFailure,
} from './helpers.ts';

/**
 * The commands documented in docs/cli. Until the behaviour behind them is built, this list is the deliverable, so the
 * tests assert that the CLI exposes exactly it — no missing commands and no extras that never made it into the docs.
 */
const APP_COMMANDS = [
  'config',
  'create',
  'deploy',
  'destroy',
  'dev',
  'info',
  'list',
  'publish',
  'status',
];
const HUB_COMMANDS = [
  'create',
  'dev',
  'login',
  'logs',
  'logout',
  'open',
  'restart',
  'start',
  'status',
  'stop',
];

const EXPECTED_IDS = [
  ...APP_COMMANDS.map((name) => `app:${name}`),
  ...HUB_COMMANDS.map((name) => `hub:${name}`),
].sort();

let config: Config;

beforeAll(async () => {
  config = await loadTestConfig();
});

describe('command tree', () => {
  it('exposes exactly the documented commands', () => {
    expect([...config.commandIDs].sort()).toEqual(EXPECTED_IDS);
  });

  it('groups every command under the app or hub topic', () => {
    const topics = config.topics.map((topic) => topic.name);

    expect(topics).toContain('app');
    expect(topics).toContain('hub');
  });

  it('gives every command a summary so help output is never blank', () => {
    for (const id of config.commandIDs) {
      const command = config.findCommand(id, { must: true });
      expect(command.summary, `${id} has no summary`).toBeTruthy();
    }
  });

  it('gives every command at least one example', () => {
    for (const id of config.commandIDs) {
      const command = config.findCommand(id, { must: true });
      expect(command.examples?.length, `${id} has no examples`).toBeGreaterThan(
        0,
      );
    }
  });

  it('describes every flag and argument', () => {
    for (const id of config.commandIDs) {
      const command = config.findCommand(id, { must: true });

      for (const [name, flag] of Object.entries(command.flags ?? {})) {
        expect(
          flag.description ?? flag.summary,
          `${id} --${name} has no description`,
        ).toBeTruthy();
      }

      for (const [name, arg] of Object.entries(command.args ?? {})) {
        expect(
          arg.description,
          `${id} ${name} has no description`,
        ).toBeTruthy();
      }
    }
  });
});

describe('documented argument contract', () => {
  it.each([
    ['app:create', ['name'], ['dir', 'template', 'registry', 'json']],
    [
      'app:publish',
      [],
      [
        'dir',
        'hub',
        'app',
        'version',
        'bump',
        'deploy',
        'non-interactive',
        'dry-run',
        'json',
        'operation-id',
      ],
    ],
    [
      'app:deploy',
      [],
      [
        'dir',
        'app',
        'release',
        'hub',
        'rollback',
        'redeploy',
        'non-interactive',
        'yes',
        'dry-run',
        'json',
        'operation-id',
      ],
    ],
    ['app:status', [], ['dir', 'app', 'hub', 'json']],
    ['app:config', ['key', 'value'], ['dir', 'json']],
    ['app:destroy', ['dir'], ['hub', 'yes']],
    ['app:destroy', ['dir'], ['hub', 'yes']],
    ['hub:create', ['name'], ['dir', 'template', 'registry', 'port', 'host']],
    ['hub:dev', [], ['hub-dir', 'port', 'host', 'portals-dir']],
    ['hub:login', [], ['hub', 'scope', 'non-interactive', 'json']],
    ['hub:logout', [], ['hub', 'json']],
    ['hub:logs', [], ['dir', 'follow', 'tail']],
    ['hub:status', [], ['dir', 'json']],
    ['hub:open', [], ['dir', 'print']],
  ])('%s takes the documented args and flags', (id, args, flags) => {
    const command = config.findCommand(id, { must: true });

    expect(Object.keys(command.args ?? {})).toEqual(args);
    expect(Object.keys(command.flags ?? {})).toEqual(flags);
  });

  it('requires the directory to delete, so destroy can never guess', () => {
    const command = config.findCommand('app:destroy', { must: true });
    expect(command.args?.dir?.required).toBe(true);
  });

  it('requires a name for the commands that create something', () => {
    for (const id of ['app:create', 'hub:create']) {
      const command = config.findCommand(id, { must: true });
      expect(command.args?.name?.required, `${id} should require name`).toBe(
        true,
      );
    }
  });

  it('leaves the app name optional where it defaults to the current directory', () => {
    const command = config.findCommand('app:info', { must: true });
    expect(command.args?.name?.required).toBeFalsy();
  });
});

describe('argument errors', () => {
  it('rejects a missing required argument', async () => {
    await expect(runCommand(config, 'app:create', [])).rejects.toMatchObject({
      oclif: { exit: 2 },
    });
  });

  it('rejects an unknown flag', async () => {
    await expect(
      runCommand(config, 'app:deploy', ['--nonexistent']),
    ).rejects.toMatchObject({
      oclif: { exit: 2 },
    });
  });

  it('rejects a non-numeric value for an integer flag', async () => {
    await expect(
      runCommand(config, 'hub:logs', ['--tail', 'abc']),
    ).rejects.toBeTruthy();
  });

  it('does not allow changing a Hub association through app config', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-config-test-'));
    try {
      const directory = path.join(root, 'config-app');
      await mkdir(path.join(directory, '.nocobase'), { recursive: true });
      await writeFile(
        path.join(directory, '.nocobase/config.json'),
        JSON.stringify({ name: 'config-app' }),
      );

      const failed = await runCommandAllowFailure(config, 'app:config', [
        'hub',
        'https://hub.example.com/hub',
        '--dir',
        directory,
      ]);

      expect((failed.error as Error).message).toContain('cannot be changed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('JSON output', () => {
  let workspace: string;

  beforeAll(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'nb3-create-json-'));
    const template = path.join(workspace, 'template');
    await mkdir(template);
    await writeFile(
      path.join(template, 'package.json'),
      `${JSON.stringify({ name: '@test/app-template', version: '1.2.3', files: ['index.js'] })}\n`,
    );
    await writeFile(path.join(template, 'index.js'), 'export {};\n');
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('prints exactly one JSON result for local app creation', async () => {
    const directory = path.join(workspace, 'sales');
    const result = await runCommand(config, 'app:create', [
      'sales',
      '--dir',
      directory,
      '--template',
      path.join(workspace, 'template'),
      '--json',
    ]);

    expect(result.lines).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      directory,
      name: 'sales',
      template: { name: '@test/app-template', version: '1.2.3' },
    });
  });

  it('prints exactly one JSON error for a local create failure', async () => {
    const directory = path.join(workspace, 'occupied');
    await mkdir(directory);
    await writeFile(path.join(directory, 'keep.txt'), 'user data');

    const result = await runCommandAllowFailure(config, 'app:create', [
      'occupied',
      '--dir',
      directory,
      '--template',
      path.join(workspace, 'template'),
      '--json',
    ]);

    expect(result.error).toMatchObject({ oclif: { exit: 2 } });
    expect(result.lines).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: 'LOCAL_ERROR' },
    });
  });
});

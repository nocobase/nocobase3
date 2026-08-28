import type { Config } from '@oclif/core';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadTestConfig, runCommand } from './helpers.ts';

/**
 * The command surface this package is expected to expose. The tests assert it exactly, so adding or renaming a command
 * is a deliberate edit here rather than something that drifts in unnoticed.
 *
 * The plugin commands are documented in docs/cli. The app and hub commands are not: their behaviour is still being
 * settled, and documenting a moving target is worse than pointing at `--help`.
 */
const APP_COMMANDS = [
  'config',
  'create',
  'deploy',
  'destroy',
  'dev',
  'info',
  'list',
  'plugin:skills:sync',
  'plugin:update',
  'pull',
];
const HUB_COMMANDS = [
  'create',
  'dev',
  'logs',
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
    ['app:create', ['name'], ['dir', 'template', 'registry']],
    ['app:pull', ['name', 'dir'], ['hub']],
    ['app:deploy', [], ['dir', 'hub']],
    ['app:config', ['key', 'value'], ['dir', 'json']],
    ['app:destroy', ['dir'], ['hub', 'yes']],
    ['app:destroy', ['dir'], ['hub', 'yes']],
    ['hub:create', ['name'], ['dir', 'template', 'registry', 'port', 'host']],
    ['hub:dev', [], ['hub-dir', 'port', 'host', 'portals-dir']],
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

/**
 * These commands are blocked on work outside the CLI. They must fail rather than print a placeholder and succeed: a
 * script that deploys, sees exit 0, and carries on would be badly misled. Exit 3 marks "not built yet" specifically,
 * so it can be told apart from a runtime error (1) or a bad argument (2).
 */
describe('unimplemented commands', () => {
  // `app deploy` and `hub start` resolve their project before reporting, so they need one to reach that point.
  let workspace: string;

  beforeAll(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'nb3-unimplemented-'));

    await mkdir(path.join(workspace, '.nb3'), { recursive: true });
    await writeFile(
      path.join(workspace, '.nb3', 'config.json'),
      JSON.stringify({
        hub: 'http://localhost:3000',
        name: 'demo',
        template: 't',
        templateVersion: '1.0.0',
      }),
      'utf8',
    );
    await writeFile(
      path.join(workspace, '.nb3', 'hub.json'),
      JSON.stringify({ host: '127.0.0.1', name: 'demo', port: 3000 }),
      'utf8',
    );
  });

  afterAll(async () => {
    await rm(workspace, { force: true, recursive: true });
  });

  it.each([
    ['app:deploy', ['--dir']],
    ['app:list', []],
    ['app:pull', ['crm']],
  ])('%s fails with exit 3', async (id, argv) => {
    const withWorkspace = argv.at(-1) === '--dir' ? [...argv, workspace] : argv;

    await expect(runCommand(config, id, withWorkspace)).rejects.toMatchObject({
      oclif: { exit: 3 },
    });
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
});

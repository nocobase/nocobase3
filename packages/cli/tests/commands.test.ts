import type { Config } from '@oclif/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadTestConfig, runCommand } from './helpers.ts';

/**
 * The commands documented in docs/cli. Until the behaviour behind them is built, this list is the deliverable, so the
 * tests assert that the CLI exposes exactly it — no missing commands and no extras that never made it into the docs.
 */
const APP_COMMANDS = [
  'config',
  'create',
  'destroy',
  'dev',
  'info',
  'list',
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
 * an automation script that sees exit 0 and carries on would be badly misled. Exit 3 marks "not built yet" specifically,
 * so it can be told apart from a runtime error (1) or a bad argument (2).
 */
describe('unimplemented commands', () => {
  it.each([
    ['app:list', []],
    ['app:pull', ['crm']],
  ])('%s fails with exit 3', async (id, argv) => {
    await expect(runCommand(config, id, argv)).rejects.toMatchObject({
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
      runCommand(config, 'app:info', ['--nonexistent']),
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

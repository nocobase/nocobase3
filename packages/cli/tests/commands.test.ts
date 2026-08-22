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
  'deploy',
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
    ['app:deploy', [], ['dir', 'hub']],
    ['app:config', ['key', 'value'], ['dir', 'json']],
    ['hub:create', ['name'], ['dir']],
    ['hub:dev', [], ['port', 'host', 'hub-dir', 'portals-dir']],
    ['hub:logs', [], ['dir', 'follow', 'tail']],
  ])('%s takes the documented args and flags', (id, args, flags) => {
    const command = config.findCommand(id, { must: true });

    expect(Object.keys(command.args ?? {})).toEqual(args);
    expect(Object.keys(command.flags ?? {})).toEqual(flags);
  });

  it('requires a name for the commands that create or delete something', () => {
    for (const id of ['app:create', 'app:destroy', 'hub:create']) {
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

/** Commands whose behaviour is built. Everything else still reports itself and exits 0. */
const IMPLEMENTED = new Set(['app:create']);

describe('stub behaviour', () => {
  it('reports every unimplemented command as not implemented', async () => {
    for (const id of config.commandIDs.filter(
      (commandId) => !IMPLEMENTED.has(commandId),
    )) {
      const command = config.findCommand(id, { must: true });
      // Derived from the command itself rather than hard-coded, so a command that gains a required argument later does
      // not quietly start failing here for the wrong reason.
      const argv = Object.values(command.args ?? {})
        .filter((arg) => arg.required)
        .map(() => 'placeholder');
      const { stdout } = await runCommand(config, id, argv);

      expect(stdout, `${id} printed nothing`).toContain('(not implemented)');
      expect(stdout, `${id} did not name itself`).toContain(
        id.replace(':', ' '),
      );
    }
  });

  it('echoes the arguments it parsed', async () => {
    const { lines } = await runCommand(config, 'app:pull', [
      'crm',
      './crm',
      '--hub',
      'http://localhost:3000',
    ]);

    expect(lines).toEqual([
      '[nb3] app pull (not implemented)',
      '  name   crm',
      '  dir    ./crm',
      '  --hub  http://localhost:3000',
    ]);
  });

  it('reports a flag default even when the flag was not passed', async () => {
    const { stdout } = await runCommand(config, 'hub:logs', []);

    expect(stdout).toContain('--tail  100');
  });

  it('omits flags that have no value', async () => {
    const { stdout } = await runCommand(config, 'hub:logs', []);

    expect(stdout).not.toContain('--follow');
    expect(stdout).not.toContain('--dir');
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

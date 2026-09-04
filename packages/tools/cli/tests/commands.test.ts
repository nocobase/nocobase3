import type { Config } from '@oclif/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadTestConfig, runCommand } from './helpers.ts';

/**
 * The command surface this package exposes, asserted exactly so adding or renaming a command is a deliberate edit here
 * rather than something that drifts in unnoticed.
 *
 * All of it is plugin registration, and all of it is reached through a `pnpm` script rather than by typing `nb3`: the
 * repository root and both application templates map these to `plugin:register`, `plugin:inspect`, and so on. See
 * internal-docs/cli.
 */
const EXPECTED_IDS = [
  'app:plugin:inspect',
  'app:plugin:register',
  'app:plugin:skills:sync',
  'app:plugin:unregister',
  'app:plugin:update',
];

let config: Config;

beforeAll(async () => {
  config = await loadTestConfig();
});

describe('command tree', () => {
  it('exposes exactly the documented commands', () => {
    expect([...config.commandIDs].sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it('groups every command under the app topic', () => {
    expect(config.topics.map((topic) => topic.name)).toContain('app');
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
  /**
   * `--dir` and `--json` are the two flags every command shares: each one has to find the application it acts on, and
   * each may be driven by an agent that needs machine-readable output. `internal-docs/cli` documents them as a table
   * covering the whole surface, so a command that quietly dropped one would make that documentation wrong.
   */
  it.each(EXPECTED_IDS)('%s accepts the shared flags', (id) => {
    const flags = Object.keys(
      config.findCommand(id, { must: true }).flags ?? {},
    );

    expect(flags).toContain('dir');
    expect(flags).toContain('json');
  });

  /**
   * `--workspace-root` targets an application inside this monorepo rather than a generated one, which is what the
   * repository root's own `plugin:*` scripts pass. `update` is the exception: it upgrades an installed package, and
   * a workspace application's plugins are linked from source rather than installed.
   */
  it.each([
    'app:plugin:inspect',
    'app:plugin:register',
    'app:plugin:unregister',
    'app:plugin:skills:sync',
  ])('%s can target a workspace application', (id) => {
    expect(
      Object.keys(config.findCommand(id, { must: true }).flags ?? {}),
    ).toContain('workspace-root');
  });

  it('names the plugin as an argument where one must be chosen', () => {
    for (const id of [
      'app:plugin:inspect',
      'app:plugin:register',
      'app:plugin:unregister',
    ]) {
      const command = config.findCommand(id, { must: true });
      expect(command.args?.name?.required, `${id} should require a name`).toBe(
        true,
      );
    }
  });
});

describe('argument errors', () => {
  it('rejects a missing required argument', async () => {
    await expect(
      runCommand(config, 'app:plugin:register', []),
    ).rejects.toMatchObject({
      oclif: { exit: 2 },
    });
  });

  it('rejects an unknown flag', async () => {
    await expect(
      runCommand(config, 'app:plugin:inspect', ['--nonexistent']),
    ).rejects.toMatchObject({
      oclif: { exit: 2 },
    });
  });
});

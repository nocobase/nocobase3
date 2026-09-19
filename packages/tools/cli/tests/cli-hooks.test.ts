import { Command } from '@oclif/core';
import { describe, expect, it, vi } from 'vitest';

import { collectCliHooks } from '../src/lib/cli-hooks.ts';
import { defineCliPlugin, defineCliPlugins } from '../src/plugins/index.ts';

class Fake extends Command {
  public async run(): Promise<void> {}
}

const plugin = (
  packageName: string,
  topic: string,
  hooks: Pick<Parameters<typeof defineCliPlugin>[0], 'buildHooks' | 'devHooks'>,
) => defineCliPlugin({ packageName, topic, commands: { go: Fake }, ...hooks });

describe('build hook declarations', () => {
  it('rejects an unknown stage', () => {
    expect(() =>
      defineCliPlugin({
        packageName: '@nocobase/app-plugin-a',
        topic: 'a',
        commands: { go: Fake },
        buildHooks: {
          afterServerbuild: [{ command: ['node', '-e', ''] }],
        } as never,
      }),
    ).toThrow(/unknown stage "afterServerbuild"/);
  });

  it('rejects an unknown dev stage', () => {
    expect(() =>
      defineCliPlugin({
        packageName: '@nocobase/app-plugin-a',
        topic: 'a',
        commands: { go: Fake },
        devHooks: { afterDev: [{ command: ['node', '-e', ''] }] } as never,
      }),
    ).toThrow(/unknown stage "afterDev"/);
  });

  it('rejects a hook without a command', () => {
    expect(() =>
      defineCliPlugin({
        packageName: '@nocobase/app-plugin-a',
        topic: 'a',
        commands: { go: Fake },
        buildHooks: { beforeBuild: [{ command: [] }] },
      }),
    ).toThrow(/without a command/);
  });

  it('rejects a command holding a non-string element', () => {
    expect(() =>
      defineCliPlugin({
        packageName: '@nocobase/app-plugin-a',
        topic: 'a',
        commands: { go: Fake },
        buildHooks: {
          beforeBuild: [{ command: ['node', 7] as never }],
        },
      }),
    ).toThrow(/non-string element/);
  });

  it('leaves a plugin declaring no hooks with an empty map', () => {
    const contributed = defineCliPlugin({
      packageName: '@nocobase/app-plugin-a',
      topic: 'a',
      commands: { go: Fake },
    });

    expect(contributed.buildHooks).toEqual({});
    expect(contributed.devHooks).toEqual({});
  });
});

describe('build hook collection', () => {
  it('reports every stage even when nothing declares a hook', () => {
    expect(collectCliHooks(defineCliPlugins([]))).toEqual({
      build: {
        beforeBuild: [],
        afterClientBuild: [],
        afterServerBuild: [],
        afterBuild: [],
      },
      dev: { beforeDev: [] },
    });
  });

  it('reports every stage when no plugins are registered at all', () => {
    expect(collectCliHooks(undefined)).toEqual({
      build: {
        beforeBuild: [],
        afterClientBuild: [],
        afterServerBuild: [],
        afterBuild: [],
      },
      dev: { beforeDev: [] },
    });
  });

  it('groups hooks by stage and names the plugin that declared each', () => {
    const collected = collectCliHooks(
      defineCliPlugins([
        plugin('@nocobase/app-plugin-a', 'a', {
          buildHooks: {
            beforeBuild: [{ label: 'Check a', command: ['node', 'a.mjs'] }],
            afterBuild: [{ label: 'Pack a', command: ['node', 'pack-a.mjs'] }],
          },
        }),
        plugin('@nocobase/app-plugin-b', 'b', {
          buildHooks: {
            afterServerBuild: [
              { label: 'Build b', command: ['pnpm', 'nocobase', 'b', 'build'] },
            ],
          },
        }),
      ]),
    );

    expect(collected.build.beforeBuild).toEqual([
      {
        packageName: '@nocobase/app-plugin-a',
        label: 'Check a',
        command: ['node', 'a.mjs'],
      },
    ]);
    expect(collected.build.afterServerBuild).toEqual([
      {
        packageName: '@nocobase/app-plugin-b',
        label: 'Build b',
        command: ['pnpm', 'nocobase', 'b', 'build'],
      },
    ]);
    expect(collected.build.afterClientBuild).toEqual([]);
    expect(collected.build.afterBuild).toHaveLength(1);
  });

  it('falls back to the command itself when a hook declares no label', () => {
    const collected = collectCliHooks(
      defineCliPlugins([
        plugin('@nocobase/app-plugin-a', 'a', {
          buildHooks: {
            beforeBuild: [{ command: ['node', '-e', 'console.log(1)'] }],
          },
        }),
      ]),
    );

    expect(collected.build.beforeBuild[0]?.label).toBe(
      'node -e console.log(1)',
    );
  });

  it('orders hooks by plugin registration, then by declaration', () => {
    const collected = collectCliHooks(
      defineCliPlugins([
        plugin('@nocobase/app-plugin-a', 'a', {
          buildHooks: {
            afterServerBuild: [
              { label: 'a1', command: ['node', '1'] },
              { label: 'a2', command: ['node', '2'] },
            ],
          },
        }),
        plugin('@nocobase/app-plugin-b', 'b', {
          buildHooks: {
            afterServerBuild: [{ label: 'b1', command: ['node', '3'] }],
          },
        }),
      ]),
    );

    expect(collected.build.afterServerBuild.map((hook) => hook.label)).toEqual([
      'a1',
      'a2',
      'b1',
    ]);
  });

  it('keeps build and dev hooks in separate groups', () => {
    const collected = collectCliHooks(
      defineCliPlugins([
        plugin('@nocobase/app-plugin-a', 'a', {
          buildHooks: {
            afterServerBuild: [
              { label: 'Build a', command: ['node', 'build.mjs'] },
            ],
          },
          devHooks: {
            beforeDev: [{ label: 'Prepare a', command: ['node', 'dev.mjs'] }],
          },
        }),
      ]),
    );

    expect(collected.build.afterServerBuild).toHaveLength(1);
    expect(collected.dev.beforeDev).toEqual([
      {
        packageName: '@nocobase/app-plugin-a',
        label: 'Prepare a',
        command: ['node', 'dev.mjs'],
      },
    ]);
  });

  it('ignores a stage declared with an empty list', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const collected = collectCliHooks(
      defineCliPlugins([
        plugin('@nocobase/app-plugin-a', 'a', {
          buildHooks: { beforeBuild: [] },
        }),
      ]),
    );

    expect(collected.build.beforeBuild).toEqual([]);
    warn.mockRestore();
  });
});

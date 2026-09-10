import { Command } from '@oclif/core';
import { describe, expect, it, vi } from 'vitest';

import { defineCliPlugin, defineCliPlugins } from '../src/plugins/index.ts';
import { assembleCli } from '../src/runtime/assemble.ts';
import { builtinCommands, builtinTopics } from '../src/runtime/builtin.ts';

class Fake extends Command {
  public async run(): Promise<void> {}
}

function plugin(packageName: string, topic: string) {
  return defineCliPlugin({ packageName, topic, commands: { go: Fake } });
}

function assemble(...plugins: ReturnType<typeof plugin>[]) {
  return assembleCli({
    builtinCommands,
    builtinTopics,
    plugins: defineCliPlugins(plugins),
  });
}

describe('assembly', () => {
  it('keeps the built-in commands under the plugin topic', () => {
    const { commands, topics } = assembleCli({
      builtinCommands,
      builtinTopics,
    });
    expect(Object.keys(commands).sort()).toEqual([
      'plugin:cli-hooks',
      'plugin:inspect',
      'plugin:register',
      'plugin:skills:sync',
      'plugin:unregister',
      'plugin:update',
    ]);
    expect(topics.plugin).toBeDefined();
  });

  it('mounts app commands under the app topic', () => {
    const { commands, topics } = assembleCli({
      builtinCommands,
      builtinTopics,
      commands: { info: Fake },
    });
    expect(commands['app:info']).toBe(Fake);
    expect(topics.app).toBeDefined();
  });

  it('leaves the app topic out when the app contributes nothing', () => {
    const { topics } = assembleCli({ builtinCommands, builtinTopics });
    expect(topics.app).toBeUndefined();
  });

  it('mounts plugin commands under the topic the plugin declares', () => {
    const { commands, topics } = assemble(
      plugin('@nocobase/app-plugin-demo', 'demo'),
    );
    expect(commands['demo:go']).toBe(Fake);
    expect(topics.demo?.description).toContain('@nocobase/app-plugin-demo');
  });

  it('nests a colon-separated command name one level deeper', () => {
    const { commands } = assembleCli({
      builtinCommands,
      builtinTopics,
      plugins: defineCliPlugins([
        defineCliPlugin({
          packageName: '@nocobase/app-plugin-demo',
          topic: 'demo',
          commands: { 'artifact:build': Fake },
        }),
      ]),
    });
    expect(commands['demo:artifact:build']).toBe(Fake);
  });
});

describe('topic collisions', () => {
  it('rejects two plugins claiming one topic, naming both', () => {
    expect(() =>
      assemble(
        plugin('@nocobase/app-plugin-a', 'dup'),
        plugin('@nocobase/app-plugin-b', 'dup'),
      ),
    ).toThrow(/@nocobase\/app-plugin-a.*@nocobase\/app-plugin-b/s);
  });

  it('rejects a plugin claiming a built-in topic', () => {
    expect(() => assemble(plugin('@nocobase/app-plugin-a', 'plugin'))).toThrow(
      /built-in/,
    );
  });

  it('rejects a plugin claiming the app topic', () => {
    expect(() =>
      assembleCli({
        builtinCommands,
        builtinTopics,
        commands: { info: Fake },
        plugins: defineCliPlugins([plugin('@nocobase/app-plugin-a', 'app')]),
      }),
    ).toThrow(/this app/);
  });
});

describe('definition validation', () => {
  it('rejects the same plugin registered twice', () => {
    expect(() =>
      defineCliPlugins([
        plugin('@nocobase/app-plugin-a', 'x'),
        plugin('@nocobase/app-plugin-a', 'y'),
      ]),
    ).toThrow(/registered more than once/);
  });

  it('rejects a command that is not an oclif Command', () => {
    expect(() =>
      defineCliPlugin({
        packageName: '@nocobase/app-plugin-a',
        topic: 'x',
        commands: { go: {} as typeof Command },
      }),
    ).toThrow(/not an oclif Command/);
  });

  it('rejects a topic that is not kebab-case', () => {
    expect(() => plugin('@nocobase/app-plugin-a', 'Not Valid')).toThrow(
      /kebab-case/,
    );
  });

  it('warns about a plugin declaring neither commands nor hooks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      defineCliPlugin({
        packageName: '@nocobase/app-plugin-a',
        topic: 'x',
        commands: {},
      }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/neither commands nor hooks/),
    );

    warn.mockRestore();
  });

  it('accepts a plugin contributing hooks alone', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const build = defineCliPlugin({
      packageName: '@nocobase/app-plugin-a',
      topic: 'x',
      buildHooks: { beforeBuild: [{ command: ['node', '-e', ''] }] },
    });
    const dev = defineCliPlugin({
      packageName: '@nocobase/app-plugin-b',
      topic: 'y',
      devHooks: { beforeDev: [{ command: ['node', '-e', ''] }] },
    });

    expect(build.commands).toEqual({});
    expect(dev.commands).toEqual({});
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});

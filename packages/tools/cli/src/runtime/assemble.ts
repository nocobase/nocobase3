// Merges built-in, app, and plugin commands into one oclif command map.
//
// Topics are a single flat namespace: `plugin` and `app` are taken by the built-in and app-owned commands, and every
// plugin claims one more. A collision is rejected here rather than resolved, because both plausible resolutions are
// worse than failing — overwriting silently loses a command, and renaming produces an id that no documentation can
// name.
import type {
  AppCliCommand,
  AppCliPlugin,
  AppCliPlugins,
} from '../plugins/types.ts';

export const APP_TOPIC = 'app';
export const PLUGIN_TOPIC = 'plugin';

export interface AssembledCli {
  readonly commands: Record<string, AppCliCommand>;
  readonly topics: Record<string, { description: string }>;
}

export interface AssembleCliOptions {
  /** Commands the app itself contributes, keyed by name; they mount under the `app` topic. */
  readonly commands?: Readonly<Record<string, AppCliCommand>>;
  readonly plugins?: AppCliPlugins;
  /** Built-in commands, already fully qualified. Defaults to this package's plugin management commands. */
  readonly builtinCommands: Readonly<Record<string, AppCliCommand>>;
  readonly builtinTopics: Readonly<Record<string, { description: string }>>;
}

export function assembleCli({
  builtinCommands,
  builtinTopics,
  commands = {},
  plugins,
}: AssembleCliOptions): AssembledCli {
  const assembled: Record<string, AppCliCommand> = { ...builtinCommands };
  const topics: Record<string, { description: string }> = {
    ...builtinTopics,
  };
  // What claimed each topic, so a collision message can name both sides rather than only the loser.
  const topicOwners = new Map<string, string>(
    Object.keys(builtinTopics).map((topic) => [topic, 'the built-in commands']),
  );

  for (const [name, command] of Object.entries(commands)) {
    assembled[`${APP_TOPIC}:${name}`] = command;
  }
  if (Object.keys(commands).length > 0) {
    topicOwners.set(APP_TOPIC, 'this app');
    topics[APP_TOPIC] ??= { description: "This app's own commands." };
  }

  for (const plugin of plugins?.plugins ?? []) {
    assertTopicAvailable(plugin, topicOwners);
    topicOwners.set(plugin.topic, plugin.packageName);
    topics[plugin.topic] = {
      description:
        plugin.description ?? `Commands contributed by ${plugin.packageName}.`,
    };
    for (const [name, command] of Object.entries(plugin.commands)) {
      assembled[`${plugin.topic}:${name}`] = command;
    }
  }

  return { commands: assembled, topics };
}

function assertTopicAvailable(
  plugin: AppCliPlugin,
  topicOwners: ReadonlyMap<string, string>,
): void {
  const owner = topicOwners.get(plugin.topic);
  if (owner === undefined) {
    return;
  }
  throw new Error(
    `CLI topic "${plugin.topic}" is claimed by both ${owner} and ${plugin.packageName}. ` +
      `Change the topic one of them declares; a topic is a single flat namespace and cannot be shared.`,
  );
}

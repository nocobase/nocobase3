import type {
  AppCliPlugin,
  AppCliPluginDefinition,
  AppCliPlugins,
} from './types.ts';

const PACKAGE_NAME_PATTERN = /^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const TOPIC_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const COMMAND_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)*$/;

export function defineCliPlugin(
  definition: AppCliPluginDefinition,
): AppCliPlugin {
  const packageName = definition.packageName.trim();
  if (!PACKAGE_NAME_PATTERN.test(packageName)) {
    throw new Error(
      `CLI plugin package name "${definition.packageName}" must be a valid scoped package name.`,
    );
  }

  const topic = definition.topic.trim();
  if (!TOPIC_PATTERN.test(topic)) {
    throw new Error(
      `CLI plugin topic "${definition.topic}" from ${packageName} must be lower-case kebab-case.`,
    );
  }

  const commands = Object.entries(definition.commands);
  if (commands.length === 0) {
    throw new Error(`CLI plugin ${packageName} declares no commands.`);
  }
  for (const [name, command] of commands) {
    if (!COMMAND_NAME_PATTERN.test(name)) {
      throw new Error(
        `CLI command name "${name}" from ${packageName} must be lower-case kebab-case, optionally nested with ":".`,
      );
    }
    // oclif loads a command by reading its static `run`, so a missing one fails at dispatch time with an error that
    // names oclif internals rather than the plugin. Rejecting it here names the plugin and the command instead.
    if (typeof command?.run !== 'function') {
      throw new Error(
        `CLI command "${topic} ${name}" from ${packageName} is not an oclif Command class.`,
      );
    }
  }

  return Object.freeze({
    packageName,
    topic,
    ...(definition.description === undefined
      ? {}
      : { description: definition.description }),
    commands: Object.freeze({ ...definition.commands }),
  });
}

export function defineCliPlugins(
  plugins: readonly AppCliPlugin[],
): AppCliPlugins {
  const seenPackages = new Set<string>();
  for (const plugin of plugins) {
    if (seenPackages.has(plugin.packageName)) {
      throw new Error(
        `CLI plugin "${plugin.packageName}" is registered more than once.`,
      );
    }
    seenPackages.add(plugin.packageName);
  }

  return Object.freeze({ plugins: Object.freeze([...plugins]) });
}

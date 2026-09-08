import type { Command } from '@oclif/core';

/**
 * A command class as oclif consumes it. oclif identifies a command by duck typing — it checks for a static `run` —
 * rather than by `instanceof`, so a plugin compiled against a different copy of `@oclif/core` still loads.
 */
export type AppCliCommand = typeof Command;

/**
 * Commands keyed by the sub-command name they answer to. `greet` becomes `<bin> <topic> greet`; a nested command uses
 * the colon form oclif already understands, so `'artifact:build'` becomes `<bin> <topic> artifact build`.
 */
export type AppCliCommands = Readonly<Record<string, AppCliCommand>>;

export interface AppCliPluginDefinition {
  /** The plugin package contributing these commands, used to name it in a topic collision. */
  readonly packageName: string;
  /** The top-level topic the commands mount under. Must be unique across the whole command tree. */
  readonly topic: string;
  /** One line shown next to the topic in `--help`. */
  readonly description?: string;
  readonly commands: AppCliCommands;
}

export interface AppCliPlugin {
  readonly packageName: string;
  readonly topic: string;
  readonly description?: string;
  readonly commands: AppCliCommands;
}

export interface AppCliPlugins {
  readonly plugins: readonly AppCliPlugin[];
}

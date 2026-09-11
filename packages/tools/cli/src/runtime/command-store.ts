// Holds the assembled command map for the registry module below.
//
// oclif's `explicit` command strategy resolves its target to a file path and imports it, so the command map cannot be
// handed to `Config.load` directly — it has to be reachable from a module oclif can import. The runner writes the map
// here before loading the config, and `registry.ts` reads it back out.
//
// The state hangs off a global symbol rather than a module-level binding because the writer and the reader do not
// always reach this file through the same module instance: the runner imports it normally, while oclif imports the
// registry through Node's own loader from a resolved path. Under a test runner that transforms modules, those are two
// copies, and a module-level binding would leave the registry reading state nobody wrote — an empty command tree
// rather than an error.
import type { AppCliCommand, AppCliPlugins } from '../plugins/types.ts';

const STORE = Symbol.for('@nocobase/nb3-cli.resolvedCommands');
const PLUGIN_STORE = Symbol.for('@nocobase/nb3-cli.registeredPlugins');

interface CommandStoreHost {
  [STORE]?: Record<string, AppCliCommand>;
  [PLUGIN_STORE]?: AppCliPlugins;
}

export function setResolvedCommands(
  resolved: Record<string, AppCliCommand>,
): void {
  (globalThis as CommandStoreHost)[STORE] = resolved;
}

export function resolvedCommands(): Record<string, AppCliCommand> {
  return (globalThis as CommandStoreHost)[STORE] ?? {};
}

/**
 * The plugin registrations behind the assembled CLI.
 *
 * Stored for the same reason as the command map, and read by the built-in `plugin build-hooks` command: a built-in
 * command is loaded by oclif from a resolved path and cannot reach the application's `cli/plugins.ts` any other way.
 * Reading the file as text would answer a different question — what is declared, rather than what this run actually
 * registered.
 */
export function setRegisteredPlugins(plugins: AppCliPlugins | undefined): void {
  (globalThis as CommandStoreHost)[PLUGIN_STORE] = plugins;
}

export function registeredPlugins(): AppCliPlugins | undefined {
  return (globalThis as CommandStoreHost)[PLUGIN_STORE];
}

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
import type { AppCliCommand } from '../plugins/types.ts';

const STORE = Symbol.for('@nocobase/nb3-cli.resolvedCommands');

interface CommandStoreHost {
  [STORE]?: Record<string, AppCliCommand>;
}

export function setResolvedCommands(
  resolved: Record<string, AppCliCommand>,
): void {
  (globalThis as CommandStoreHost)[STORE] = resolved;
}

export function resolvedCommands(): Record<string, AppCliCommand> {
  return (globalThis as CommandStoreHost)[STORE] ?? {};
}

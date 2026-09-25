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
import type { AppLocation } from './location.ts';

const STORE = Symbol.for('@nocobase/app-cli.resolvedCommands');
const APP_STORE = Symbol.for('@nocobase/app-cli.application');
const OPEN_RUNTIMES = Symbol.for('@nocobase/app-cli.openRuntimes');

/** What a run knows about the application it is in, for commands oclif loads from a resolved path. */
export interface ApplicationState {
  readonly location: AppLocation;
  /** The application's plugin contributions, imported on first use and shared by every caller after that. */
  readonly loadPlugins: () => Promise<AppCliPlugins | undefined>;
}

/** A runtime a command loaded and has not put away yet. */
export interface OpenRuntime {
  readonly close: () => Promise<void>;
}

interface CommandStoreHost {
  [STORE]?: Record<string, AppCliCommand>;
  [APP_STORE]?: ApplicationState;
  [OPEN_RUNTIMES]?: Set<OpenRuntime>;
}

/**
 * Records a loaded runtime until its scope is destroyed, so that the runner can close whatever a command left open.
 * Returns the function that forgets it again.
 */
export function trackOpenRuntime(runtime: OpenRuntime): () => void {
  const host = globalThis as CommandStoreHost;
  const open = (host[OPEN_RUNTIMES] ??= new Set());
  open.add(runtime);
  return () => {
    open.delete(runtime);
  };
}

/** The runtimes still open, forgotten as they are returned. */
export function takeOpenRuntimes(): OpenRuntime[] {
  const open = (globalThis as CommandStoreHost)[OPEN_RUNTIMES];
  if (open === undefined) return [];
  const runtimes = [...open];
  open.clear();
  return runtimes;
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
 * The application behind this run.
 *
 * Stored for the same reason as the command map: a built-in command is loaded by oclif from a resolved path and cannot
 * reach the application any other way. `dev` and `build` read the plugins' hooks from here, which is why the plugins
 * are loaded lazily — a command that never asks does not pay for importing every plugin's CLI entry, and does not fail
 * when one of them is broken.
 */
export function setApplicationState(state: ApplicationState | undefined): void {
  (globalThis as CommandStoreHost)[APP_STORE] = state;
}

export function applicationState(): ApplicationState {
  const state = (globalThis as CommandStoreHost)[APP_STORE];
  if (state === undefined) {
    throw new Error(
      'This command runs through the nocobase CLI, which records the application it runs in.',
    );
  }
  return state;
}

// What a command's tests import: a way to run an `AppCommand` against a fixture application without the runner.
import {
  PINNED_APP_CONTEXT,
  type AppCommand,
  type AppCommandContext,
} from './context.ts';
import {
  createDefaultCommandContext,
  type AppCommandContextOptions,
} from './default-context.ts';

export type BindAppCommandOptions = AppCommandContextOptions;

/**
 * A subclass of `command` pinned to the application at `rootDir`, the way the runner would point it at the application
 * it located. Run it with `await Bound.run(argv)`; with `--json`, the returned value is the command's result. Each call
 * returns a fresh class, so two tests never share a context. `loadRuntime` and `createApp` replace the conventional
 * `server/runtime` and `server/app` imports with stubs.
 */
export function bindAppCommand<T extends typeof AppCommand>(
  command: T,
  options: BindAppCommandOptions,
): T {
  const Base = command as typeof AppCommand;
  const bound = class extends Base {};
  Object.defineProperty(bound, PINNED_APP_CONTEXT, {
    value: createDefaultCommandContext(options) satisfies AppCommandContext,
  });
  return bound as unknown as T;
}

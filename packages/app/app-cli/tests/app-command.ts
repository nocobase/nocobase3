import type { AppCommand } from '../src/context.ts';
import {
  createDefaultCommandContext,
  type AppCommandContextOptions,
} from '../src/default-context.ts';

/**
 * A subclass of an application command pinned to a fixture, the way the runner would point it at the application it
 * located. Each call returns a fresh class, so two tests never share a context.
 */
export function bindAppCommand<T extends typeof AppCommand>(
  command: T,
  options: AppCommandContextOptions,
): T {
  const bound = class extends command {};
  bound.appContext = createDefaultCommandContext(options);
  return bound;
}

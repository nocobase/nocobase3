// The `oclif.commands.target` module for the assembled CLI.
//
// oclif imports this module and reads its default export as the command map. The map is only known once the runner has
// merged built-in, app, and plugin commands, so this proxies the store rather than exporting a literal — oclif enumerates
// the keys at load time and reads each one when dispatching.
import { resolvedCommands } from './command-store.ts';

const registry: Record<string, unknown> = new Proxy(
  {},
  {
    get: (_target, key) =>
      (resolvedCommands() as Record<string | symbol, unknown>)[key],
    getOwnPropertyDescriptor: (_target, key) => {
      const value = (resolvedCommands() as Record<string | symbol, unknown>)[
        key
      ];
      return value === undefined
        ? undefined
        : { configurable: true, enumerable: true, value };
    },
    has: (_target, key) => key in resolvedCommands(),
    ownKeys: () => Reflect.ownKeys(resolvedCommands()),
  },
);

export default registry;

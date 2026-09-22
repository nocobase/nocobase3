# @nocobase/app-cli

Shared application CLI commands, usable from both source applications and built deployments. Install as an application dependency. Development and build orchestration belong to `@nocobase/app-tools`; `@nocobase/nb3-cli` continues to own command discovery and dispatch.

## Register commands

```ts
import path from 'node:path';
import { createAppCommands } from '@nocobase/app-cli';

export default createAppCommands({
  rootDir: path.resolve(import.meta.dirname, '..'),
  publishing: true,
});
```

The factory accepts one options object and returns `info`, `migrate`, `seed`, `collections:generate`, and `i18n:check`. Set `publishing: true` in that object to add `upload` and `deploy` for publishing application releases to a Hub. The Default template enables these commands; Examples and Hub disable them.

Registration does not load or start the application. When needed, the default loaders discover `server/runtime.ts` and `server/app.ts` relative to `rootDir`, falling back to `.js` only when the TypeScript file is absent. The runtime module must default-export its definition; the application module must export `createApp(runtime)`. Module execution errors propagate without trying another file. Nonstandard layouts can supply optional `loadRuntime` and `createApp` callbacks in the same options object.

Migration and seed commands create the application, register providers, and reuse its database manager and contributions without calling `boot/start` or triggering autoRun. They dispose the application and standalone scope on completion or failure. Other commands load only the runtime they need.

Keep `cli/index.ts`, plugin registration, command registration, and custom business commands in the application. Merge or override the returned command map in the application's composition root. The default template retains small per-command reexports for compatibility with existing customizations.

`database-command`, `hub-publishing`, and `commands/i18n-check` subpaths expose helpers used by existing application code. No module infers the application root from this package's installation directory.

## Publication

Only compiled ESM JavaScript and declarations in `dist/` are published. The application supplies its shared `app-server`, `db`, and `nb3-cli` peers.

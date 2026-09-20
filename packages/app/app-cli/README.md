# @nocobase/app-cli

Shared application CLI commands, usable from both source applications and built deployments. Install as an application dependency. Development and build orchestration belong to `@nocobase/app-tools`; `@nocobase/nb3-cli` continues to own command discovery and dispatch.

## Register commands

```ts
import { createAppCommands } from '@nocobase/app-cli';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';

const commands = createAppCommands({
  rootDir,
  loadRuntime: async () => {
    const { default: runtime } = await import('../server/runtime.js');
    return resolveStandaloneAppRuntime(runtime, { rootDir });
  },
});
```

The factory returns `info`, `migrate`, `seed`, `collections:generate`, and `i18n:check`. Pass `{ publishing: true }` as the second argument to add Hub `upload` and `deploy` commands. Each factory binds a separate application context; registration does not load or start the application runtime. Commands that need database services invoke `loadRuntime` when run and own their cleanup.

Keep `cli/index.ts`, plugin registration, command registration, and custom business commands in the application. Merge or override the returned command map in the application's composition root. The default template retains small per-command reexports for compatibility with existing customizations.

`database-command`, `hub-publishing`, and `commands/i18n-check` subpaths expose helpers used by existing application code. No module infers the application root from this package's installation directory.

## Publication

Only compiled ESM JavaScript and declarations in `dist/` are published. The application supplies its shared `app-server` and `nb3-cli` peers.

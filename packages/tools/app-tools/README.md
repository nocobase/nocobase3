# @nocobase/app-tools

Shared application development and build tooling. Install this package as an application dev dependency. Production CLI commands belong to `@nocobase/app-cli`; command discovery remains in `@nocobase/nb3-cli`.

## Application entry points

Keep application scripts as thin entry points with an explicit application root:

```js
import path from 'node:path';
import { runAppTool } from '@nocobase/app-tools';

process.exitCode = await runAppTool('build', {
  rootDir: path.resolve(import.meta.dirname, '..'),
});
```

`runAppTool` forwards arguments, inherits standard streams, forwards termination signals, and returns the child exit code. Supported lifecycle entries are `dev`, `build`, `start`, `retarget`, and `verify`. File paths are resolved against the application root, never the installed tools directory.

`dev` supervises development: `.env` and `.env.local` changes restart the development process, including Vite; `config.yml` changes restart only the server. Build and development retain the application's CLI plugin hooks. Configure application behavior through those hooks and local configuration.

Use `scripts/dev.mjs` as the single application development entry and import `createDevProxy` directly from `@nocobase/app-tools/dev/proxy` in Vite configuration. Development supervision, watchers, and port selection are internal modules. Applications use a single `scripts/server-deps.mjs` dispatcher for standalone `retarget` and `verify` operations; pass the remaining command arguments explicitly through `args`. Package generation, cleanup, pruning, and archiving remain internal build steps. Shared implementation tests live in this package; templates retain composition and application integration tests.

## Publication

The package publishes compiled JavaScript, declarations, and its internal `.mjs` scripts in `dist/`. Application roots and CLI registrations remain application-owned. It must not be added to an application's production dependencies.

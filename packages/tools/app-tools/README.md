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

## What the host application must provide

These tools are spawned as executables rather than imported, so neither `pnpm deps:check` nor `pnpm peers:check` can see them — both read import specifiers. The application provides them, and they are declared as peer dependencies to say so in the published manifest:

| Executable | Provided by         | Used by                                                       |
| ---------- | ------------------- | ------------------------------------------------------------- |
| `vite`     | `vite`              | `dev`, and `build` through it                                 |
| `tsx`      | `tsx`               | `dev`, to run the server                                      |
| `nocobase` | `@nocobase/nb3-cli` | `build` and `dev`, to read the application's plugin CLI hooks |
| `tsc`      | `typescript`        | `build`, through `pnpm exec tsc`                              |

`typescript` is also imported directly, to parse `server/plugins.ts` without running it. The peer declaration is what keeps that parser and the `tsc` the build invokes on one version: a split lets the application compile syntax the parser then fails on, and the failure is silent — plugin sources simply stop triggering a restart.

`pnpm` and `npm` are taken from the environment and are not declared.

When a script starts spawning something new, add it here and declare it. Nothing else will catch the omission: it resolves in this repository and in any application generated from a template, because both already install these, and is missing only in an application that does not.

## Publication

The package publishes compiled JavaScript, declarations, and its internal `.mjs` scripts in `dist/`. Application roots and CLI registrations remain application-owned. It must not be added to an application's production dependencies.

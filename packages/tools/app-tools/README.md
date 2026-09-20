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

`runAppTool` forwards arguments, inherits standard streams, forwards termination signals, and returns the child exit code. Supported lifecycle entries are `dev/run`, `dev/index`, `build`, and `start`. Build utility entries support the template's existing script paths. File paths are resolved against the application root, never the installed tools directory.

`dev/run` supervises development: `.env` and `.env.local` changes restart the development process, including Vite; `config.yml` changes restart only the server. Build and development retain the application's CLI plugin hooks. Configure application behavior through those hooks and local configuration.

The `dev/*` and `utils/*` subpaths preserve existing template helper imports during extraction. Prefer the lifecycle launcher for new integrations. Shared implementation tests live in this package; templates retain composition and application integration tests.

## Publication

The package publishes compiled JavaScript, declarations, and its internal `.mjs` scripts in `dist/`. Application roots and CLI registrations remain application-owned. It must not be added to an application's production dependencies.

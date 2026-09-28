---
'@nocobase/dev-config': minor
---

The shared ESLint presets hold commands under `cli/` to the application command line's contract. Importing `@nocobase/app-server/node`, calling `process.cwd()`, writing with `console.log`, and calling `this.exit()` or `this.logJson()` are errors there, and each message names what to use instead: `withApp()`, `this.rootDir` or an `appPath()` flag, `this.log` and a returned result, or `CommandError`.

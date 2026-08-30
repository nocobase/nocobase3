# @nocobase/nb3-cli

## 0.1.0-beta.2

### Patch Changes

- 7cdffbd: Replace separate API and root route arrays with one ordered `routes` contribution array. Route factories now receive the Application, create and return their own Hono router, and are mounted automatically at `/api` or the application root according to their definition.

  Standardize plugin server modules around `providers/index.ts` and `routes/index.ts` collection entries, `services/` domain implementations, and a stable `tokens.ts` public contract.

  Generated plugins now declare conventional database and queue contribution directories by default. Missing optional directories are ignored until executable migrations, seeds, or jobs are added.

  Generated plugins now include an App-facing starter Agent Skill under the package's `skills/` directory. Plugin registration and skill synchronization copy these package-owned Skills into registered applications' `.agents/skills/` directories.

  Unify Client page contributions behind one `routes` loader. Plugins now use `defineAppRoutes()` and `defineSettingsRoutes()` to add child Routes to the application's two built-in Client Routes, mirroring how Server plugins use `defineRootRoutes()` and `defineApiRoutes()` with the built-in Hono routers.

- 12dfb68: Add the template-based `@nocobase/create-plugin` scaffold with complete client and server examples, including shadcn configuration for plugin-owned runtime UI and an application-owned Registry component recipe with build, materialize, and publishing metadata. Reuse the `nb3 app plugin` commands from the monorepo root, and register exported server plugin definitions in the application's explicit `server/plugins.ts` composition root.

## 0.1.0-beta.1

### Minor Changes

- c8f38c8: Add `nb3 app plugin register` and `nb3 app plugin unregister`, so an application generated from the template can install, wire, and remove a plugin. Both are available as `pnpm plugin:register` and `pnpm plugin:unregister`.

  Registering installs the package, records the dependency and the `nocobase.plugins` entry, imports the plugin in `client/plugins.ts`, and copies the skills it ships into `.agents/skills`. Unregistering reverses all four. The editing logic is shared with this repository's own `plugin:register` scripts; only the plugin lookup and the recorded dependency range differ.

  Only a plugin that ships a `./client/plugin` export is written into `client/plugins.ts`. A server-only plugin is registered without it, because importing an export it does not have leaves the application unable to build.

  An application without TypeScript still gets the install, the manifest entry, and the skills; only the `client/plugins.ts` edit is skipped, and the exact lines to add are printed so they can be applied by hand or by an agent.

- 1a9732a: Register a plugin's client entry as `<package>/client` rather than `<package>/client/plugin`, matching the barrel default export plugins now ship.

  The server-only check follows the same move: it looks for `exports["./client"]`, because that is the specifier registration writes and the check has to match it. A plugin published with only `./client/plugin` predates the barrel, so it is skipped rather than wired to an import the application cannot resolve.

  Reading tolerates both forms. An application wired before this change imports `<package>/client/plugin`, and treating that as unregistered would make `plugin register` add a second, conflicting import for a plugin that is already there.

### Patch Changes

- 08d1108: Fix the process-group test reading a colourized pid. The helper script logged `child.pid` as a number, and `console.log` inspects numbers — wrapping them in ANSI escapes whenever `FORCE_COLOR` is set. `Number()` then produced `NaN`, and the test failed on its liveness precondition before reaching the group-kill it exists to verify.

  The test is unchanged otherwise; only the pid crosses the pipe as a plain string now.

## 0.0.1-beta.0

### Patch Changes

- da1b1b0: 首次发布。

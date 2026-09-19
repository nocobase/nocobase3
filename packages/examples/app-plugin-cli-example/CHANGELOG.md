# @nocobase/app-plugin-cli-example

## 0.1.0-beta.2

### Minor Changes

- e9f796d: Demonstrate a build hook

  The plugin now registers a `beforeBuild` hook alongside its commands, showing that a hook command is any executable rather than one of the plugin's own oclif commands.

### Patch Changes

- Updated dependencies [e9f796d]
  - @nocobase/nb3-cli@1.0.0-beta.6

## 0.1.0-beta.1

### Patch Changes

- 52d1107: Declare each peer dependency once, dropping the devDependency that used to accompany it.

  The pairing was required on the grounds that a peer range is wide enough for development to drift off this repository's copy. It is not: pnpm installs a peer and links it into the plugin's own `node_modules`, resolving `workspace:^` to the same package `workspace:*` would. A plugin with the devDependency removed still links, typechecks, builds, and tests against it — verified against a clean install with every plugin's `node_modules` deleted first.

  What remained was a second declaration that changed nothing and had to be kept in step with the first. `pnpm peers:check` no longer asks for it, and `create-plugin` no longer emits it.

## 0.1.0-beta.0

### Minor Changes

- ec576ba: Let plugins contribute commands to an application's CLI, and rename the bin to `nocobase`.

  An application now has a `cli/` composition root beside `client/` and `server/`. Its `cli/index.ts` calls `runAppCli()` from `@nocobase/nb3-cli/runtime`, which assembles one command tree from three sources: the built-in plugin management commands under `plugin`, the application's own commands under `app`, and each registered plugin's commands under the topic that plugin declares. `pnpm nocobase` runs it.

  A plugin contributes commands by exporting a `./cli` entry that calls `defineCliPlugin()` with a topic and a map of oclif `Command` subclasses. `@nocobase/app-plugin-cli-example` is the reference implementation. `@oclif/core` is a peer dependency of such a plugin so that the plugin and the application share one copy, which is what keeps help rendering and flag parsing consistent.

  `plugin register`, `plugin unregister`, and `plugin inspect` maintain `cli/plugins.ts` the same way they already maintain `client/plugins.ts` and `server/plugins.ts`, keyed on whether the plugin exports `./cli`. An application without TypeScript degrades to printed instructions for that file exactly as it does for the other two.

  `cli/` is compiled into `dist`, so a deployed application runs the same commands with `node ./cli/index.js`. The application's own `migrate` and `seed` are now commands rather than separate scripts, and `pnpm migrate` / `pnpm seed` dispatch through the CLI — the script names are unchanged. A command that cannot work in a deployment goes in `cli/dev-commands/`, which the build excludes; client inspection lives there because it needs Vite and the browser client. `server:config` was removed outright.

  Two breaking changes come with this. The bin is `nocobase` rather than `nb3`, and the five plugin commands moved from `app plugin *` to the top-level `plugin *`, which frees the `app` topic for the commands an application writes itself. The `pnpm plugin:*` script names are unchanged, so anything invoking those scripts is unaffected.

### Patch Changes

- Updated dependencies [ec576ba]
- Updated dependencies [67907ec]
  - @nocobase/nb3-cli@1.0.0-beta.5

## 0.0.1

### Patch Changes

- Add an example plugin that contributes commands to an application's `nocobase` CLI, demonstrating arguments, flags, JSON output, and a nested sub-command.

---
'@nocobase/nb3-cli': minor
---

Let a plugin register commands for an application's build and dev runs

A plugin declares `buildHooks` and `devHooks` on `defineCliPlugin`, and the new `nocobase plugin cli-hooks` command reports what the registered plugins ask for. An application's `pnpm build` and `pnpm dev` read that list and run the commands, so a step belonging to a plugin no longer has to be written into every application's build script.

Build stages are `beforeBuild`, `afterClientBuild`, `afterServerBuild`, and `afterBuild`, named for what exists in `dist` when the hook runs. `pnpm dev` has one stage, `beforeDev`, because it starts concurrent long-running processes rather than finishing steps.

A plugin contributing hooks alone is now valid: `commands` is optional, and declaring neither commands nor hooks warns rather than throwing.

---
'@nocobase/app-cli': patch
---

`plugin inspect --json` suggests commands that exist again: `pnpm nocobase plugin register <name>` and `pnpm nocobase skills sync --plugin <name>`, with the `--dir` or `--workspace-root`/`--app` that located the application, instead of the removed `pnpm plugin:register` and `pnpm skills:sync` scripts. Hints printed by `plugin register`, `package remove` and `skills sync` name the commands the same way.

`@refinedev/cli` and `tsc-alias` are declared as optional peers. `nocobase build` runs both, and every template already provides them in `devDependencies`; an application that does not have them now sees that from the manifest instead of from a failed build.

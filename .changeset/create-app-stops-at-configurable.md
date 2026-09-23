---
'@nocobase/create-app': minor
---

Stop generating `config.yml` and stop choosing a database. Creation now produces a project that is ready to configure, and `pnpm config:init` configures it.

`--dialect` is removed. It decided two things at once — the connection settings written into `config.yml` and which driver the project depended on — and only one of them belonged to scaffolding. The templates now depend on `@nocobase/db-sqlite`, the dialect their own `server/config/database.ts` defaults to, so a generated application still needs nothing installed before it can be configured; using another database means adding its driver and running `config:init --dialect` with it, both inside the application.

`nextCommands` is now the whole remaining procedure in order — `pnpm config:init` then `pnpm dev`, preceded by `pnpm install` after `--no-install`, and ending with `pnpm build` and `pnpm start` for a Hub — so an agent can run it as written instead of reconstructing it from prose. `dialect`, `configurationRequired`, `configFile`, `configPath` and `databaseConnectionVerified` are gone from the JSON result, replaced by `configured`, which is always `false`.

A generated project now carries an `.npmrc` recording the registry the template came from, scoped to `@nocobase`. Until now that registry was passed to the one install this command runs and then forgotten, so the next `pnpm add @nocobase/…` a user ran — a driver for another dialect, a plugin, an upgrade — resolved against the public npm and failed with a 404 that never mentioned a registry. The line is omitted when the registry is the public npm, so an application generated once the packages are published there carries no pin to a mirror. `strict-peer-dependencies=false` is written alongside it, because the templates carry it in their own `.npmrc` and npm strips that file from every tarball it builds.

---
'@nocobase/app-server': minor
'@nocobase/app-cli': minor
'@nocobase/app-skills': patch
'@nocobase/app-plugin-api-keys': patch
'@nocobase/app-plugin-repository-example': patch
'@nocobase/app-template-default': minor
'@nocobase/app-template-examples': minor
'@nocobase/app-template-hub': minor
---

Add `db apply` and `db reset`, and retire `migrate --fresh`.

`nocobase app db apply` (`pnpm db:apply`) runs migrations and seeds as one plan, in the order startup runs them: each connection is migrated, then seeded. Only pending tasks run, so repeating it is safe. `nocobase app db reset` (`pnpm db:reset`) drops every managed schema object first and reruns both from empty; it asks for confirmation and requires `--force` in CI or a non-interactive terminal.

`migrate --fresh` is removed and now exits with a pointer to `db reset`. It rebuilt the schema without reseeding, so it left the seed history cleared and no seed executed — the default connection recovered on the next startup, and a connection with `autoRun: false` did not.

The `migrate` and `seed` scripts are gone from the application templates; `pnpm db:apply` replaces both. The commands themselves remain available as `pnpm nocobase app migrate` and `pnpm nocobase app seed` for a deployment that has to run one half at a time.

`runAppDatabaseTasks` accepts several task kinds in one plan through its `kind` option, which is what makes a reset correct across both kinds: one plan means a connection's schema is rebuilt by its migrations task before its seeds run.

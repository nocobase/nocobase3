---
'@nocobase/create-app': minor
---

Generate `config.yml` from the template's own `config.example.yml` and remove `--db-dialect`.

The database is no longer chosen at generation time. Since dialects were split into `@nocobase/db-*` packages, a connection may only use a dialect the application registers in `server/config/database.ts`, and that file cannot be overridden from `config.yml`. Adding a bare driver to `dependencies` — what `--db-dialect` did — therefore produced an application that failed to start with `Database dialect "postgres" is not registered.` for every dialect but SQLite. A generated application now starts on the SQLite connection its template declares, and another database is a change to that file plus the matching dialect package.

`config.yml` is built from the template's `config.example.yml` with `auth.secret` and `session.secret` filled in, rather than assembled here. The example documents everything an application can be configured with — notification channels, LLM services, additional connections — and a file written from scratch carried a fraction of it and went stale whenever the example grew.

A hub is generated the same way. It owns a database like any other application, so it now gets a `config.yml` too: without one it started in install mode on a secret regenerated every boot, which invalidated every session on restart. It also gets its plugin skills synchronized, and no longer gets the vestigial `app-dist/` directory, which nothing reads. `.env` remains, for the deployment facts that belong to it.

The fallback `.gitignore`, written when a template ships none, now also covers `.env`, `config.toml`, and the local SQLite files.

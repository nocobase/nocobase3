---
name: nocobase-db-integration-testing
description: 'Decide which NocoBase v3 database dialect integration suites a change requires, and run them with the correct command and scheduling. Use after changing packages/libs/db, packages/libs/db-testkit, or any packages/libs/db-<dialect> package, including shared contract tests, dialect adapters, SQL generation, schema inspection, migrations, and seeds. Do not use for unit tests, for packages outside packages/libs/db*, or for NocoBase v2 database packages.'
---

# NocoBase Database Integration Testing

This Skill answers one question: **given what I just changed, which integration
suites do I run, and how.** It is a routing layer; the full option reference is
[`internal-docs/development/database-integration-testing.md`](../../../internal-docs/development/database-integration-testing.md),
and the dialect/shared ownership boundary is
[`packages/libs/db-testkit/TESTING.md`](../../../packages/libs/db-testkit/TESTING.md).

Apply it only in a workspace that contains `packages/libs/db/` and
`packages/libs/db-testkit/`. A repository with `packages/core/database/` is
NocoBase v2 and uses a different test protocol.

## Run the least that covers the change

Every pull request already runs all eight dialects — the `db-integration` matrix
in `.github/workflows/quality.yml` is unconditional and is not filtered by
changed paths, and it gives each dialect its own runner. Locally there is one
machine and the suites run one at a time, so a full local pass costs hours and
proves nothing CI will not prove anyway. Run the dialects the change actually
puts at risk and let CI cover the rest.

| What changed                                                                                           | Run                                                                  |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `packages/libs/db-<dialect>/` — adapter, SQL, catalog inspection, driver options                       | that dialect only                                                    |
| `packages/libs/db-testkit/tests/integration/` — a shared contract every dialect loads                  | `sqlite`, then one Docker-backed dialect such as `postgres`          |
| `packages/libs/db-testkit/src/` — runner, loader, adapter contract, profile                            | `sqlite`, then one Docker-backed dialect: the harness itself changed |
| `packages/libs/db/src/` under `query/`, `schema/`, `repository/`, `metadata/`, `migration/`, `json.ts` | `sqlite`, then `postgres`, `mysql`, `kingbase`, one after another    |
| `packages/libs/db/src/` elsewhere — `naming/`, types, tokens                                           | unit tests only; no integration suite                                |
| A dialect-specific defect reported against one database                                                | that dialect, with `--test-file` narrowed to the failing contract    |

A shared contract runs on every dialect, so a test added under
`db-testkit/tests/integration/` must stay portable: no dialect name, no
`PRAGMA`, `information_schema`, `user_*`, or `sys.*`. Catalog SQL belongs to the
dialect package's own `tests/`.

## Commands

Run one dialect from the repository root:

```bash
pnpm --filter @nocobase/db-postgres test:integration
```

Narrow to shared contract files. The standalone `--` is what forwards the
arguments to the runner, and paths are relative to
`packages/libs/db-testkit/tests/integration`:

```bash
pnpm --filter @nocobase/db-mysql test:integration -- \
  --test-file tests/integration/schema/inspector.test.ts \
  --test-file tests/integration/query/where.test.ts
```

The wrapper always runs `core-suite.test.ts` first so the dialect adapter is
installed before a selected file loads. When a run fails, `--pause-on-failure`
keeps the containers alive until you press Enter; it is for an interactive
terminal and exits normally in CI. `KEEP_TEST_DB=1` keeps the database without
pausing.

## Four things that go wrong

- **`@nocobase/db` has no integration script.** It used to forward to each
  dialect, so `pnpm --filter @nocobase/db test:integration` read as a full run
  while it only ran SQLite. Those aliases are gone; always name the dialect
  package. For full verification, run the eight suites one after another rather
  than looking for a single command that does it.
- **Two suites must never run at once.** Each runner isolates its Compose
  project and host port, so nothing collides — but they share one Docker
  daemon, and the contention pushes health checks past their start period and
  fails the run during startup. Wait for each suite to exit; do not background
  one, and do not chain them with `&`.
- **Dropping the standalone `--`** leaves `--test-file` unconsumed by the
  runner and silently runs the whole shared suite.
- **`pnpm -r test` is not how these run.** It excludes
  `**/tests/integration/**` in every `db-*` package, so it reports success
  having executed no integration test at all.

If a run was interrupted, check for leftover Compose services before starting
the next suite. The runner uses a random project name and removes
its own containers, volumes, and orphans on exit.

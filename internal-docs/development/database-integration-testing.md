---
title: Database Integration Test Execution
description: How to run NocoBase v3 database dialect integration tests safely and efficiently.
---

# Database Integration Test Execution

This guide describes the default behavior and supported execution order for the
integration suites in the `@nocobase/db-*` packages. Each suite starts (or
reuses) a database service through its package-local `docker-compose.yml`, then
runs the shared integration contract with the dialect-specific adapter.

## The dialect package is the entry point

Each suite is owned by its dialect package, and that package is the only way to
run it:

```bash
pnpm --filter @nocobase/db-sqlite test:integration
```

`@nocobase/db` carries no integration script. It used to forward to each dialect
through `test:integration` and `test:integration:<dialect>`, but the first ran
SQLite while reading as a full run, so the aliases were removed.

Nothing runs by default. Name the dialect you need, and run it only when that
database is available.

## Run one dialect

Run a single suite from the repository root with its package filter:

```bash
pnpm --filter @nocobase/db-mysql test:integration
```

Use `--test-file` to select one or more shared files from
`packages/libs/db-testkit/tests/integration`. The wrapper still runs
`core-suite.test.ts`, so the dialect adapter is installed before the selected
file is loaded:

```bash
pnpm --filter @nocobase/db-mysql test:integration -- \
  --test-file tests/integration/schema/inspector.test.ts
pnpm --filter @nocobase/db-mysql test:integration -- \
  --test-file tests/integration/schema/inspector.test.ts \
  --test-file tests/integration/query/count.test.ts \
  -t indexes
```

The `--test-file` option may be repeated or written as
`--test-file=<path>`. If no file is provided, all shared integration files are
loaded. A path may include the `tests/integration/` prefix or be relative to
that directory.

When diagnosing a failure, add `--pause-on-failure`. The runner keeps the
temporary database containers alive and waits for Enter before cleanup:

```bash
pnpm --filter @nocobase/db-postgres test:integration \
  -- --test-file tests/integration/schema/inspector.test.ts \
  --pause-on-failure
```

The standalone `--` after the script name is important: it tells pnpm to
forward the remaining arguments to `test-integration.ts`. The equivalent
environment-variable form is useful when shell or CI argument forwarding is
awkward:

```bash
PAUSE_ON_FAILURE=1 pnpm --filter @nocobase/db-postgres test:integration \
  -- tests/integration/schema.test.ts
```

This option is intended for an interactive terminal. In CI or another
non-interactive environment it prints a warning and exits normally instead of
waiting forever. `KEEP_TEST_DB=1` remains available when you want to keep the
database without pausing the process.

The same syntax works for SQLite, PostgreSQL, MySQL, Oracle, MSSQL, Dameng,
OceanBase, and Kingbase.

Replace `mysql` with `sqlite`, `postgres`, `kingbase`, `oceanbase`, `oracle`,
`mssql`, or `dameng` as needed. SQLite runs directly through Vitest; the other
dialects use the package's integration runner and Docker Compose.

## Run one suite at a time

Start a suite, wait for it to finish, then start the next one. Never run two
integration suites at once, and never leave one in the background:

```bash
pnpm --filter @nocobase/db-postgres test:integration && \
  pnpm --filter @nocobase/db-mysql test:integration
```

Collisions are not the reason. Each Docker-backed runner generates an isolated
Compose project name and a dynamically published host port, so two suites never
share a container, a network, or a port. What they do share is one machine:
concurrent runs compete for the same Docker daemon's CPU, memory, and disk I/O,
which pushes service health checks past their start period and turns a passing
suite into an intermittent startup failure. The heavier services show it first
— Kingbase declares a 30 second health check start period, and MSSQL and Dameng
run additional init services before their tests — but the result is a flaky run
rather than a clean signal for any of the dialects involved.

CI parallelizes safely because it does not share a machine: the `db-integration`
matrix gives every dialect its own runner.

## Running the complete set

Every pull request runs all eight dialects, one per CI runner, so a local full
run is rarely worth the wall clock. When one is genuinely required, chain the
commands and let it take the time it takes:

```bash
for dialect in sqlite postgres mysql kingbase oceanbase oracle mssql dameng; do
  pnpm --filter "@nocobase/db-$dialect" test:integration || break
done
```

For normal development, run only the dialect under change.

## Environment and cleanup

The integration runner chooses a random Compose project name and removes its
containers, volumes, and orphan services when the suite exits. Set
`KEEP_TEST_DB=1` only when debugging and you need to inspect the database after
the run. If a run is interrupted, verify that no leftover Compose services are
still using resources before starting the next suite.

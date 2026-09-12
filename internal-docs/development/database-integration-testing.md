---
title: Database Integration Test Execution
description: How to run NocoBase v3 database dialect integration tests safely and efficiently.
---

# Database Integration Test Execution

This guide describes the default behavior and supported execution order for the
integration suites in the `@nocobase/db-*` packages. Each suite starts (or
reuses) a database service through its package-local `docker-compose.yml`, then
runs the shared integration contract with the dialect-specific adapter.

## Default behavior

The default `@nocobase/db` integration command runs **SQLite only**:

```bash
pnpm --filter @nocobase/db test:integration
```

PostgreSQL, MySQL, Oracle, MSSQL, Dameng, and OceanBase are opt-in. Run their
package-specific command only when that database is available and the suite is
needed.

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

Replace `mysql` with `sqlite`, `postgres`, `oceanbase`, `oracle`, `mssql`, or
`dameng` as needed. SQLite runs directly through Vitest; the other dialects use
the package's integration runner and Docker Compose.

## Suites that may run concurrently when requested

These suites can be started at the same time:

- `sqlite`
- `postgres`
- `mysql`

From the repository root:

```bash
pnpm --filter @nocobase/db-sqlite test:integration &
sqlite_pid=$!
pnpm --filter @nocobase/db-postgres test:integration &
postgres_pid=$!
pnpm --filter @nocobase/db-mysql test:integration &
mysql_pid=$!

wait "$sqlite_pid" "$postgres_pid" "$mysql_pid"
```

The commands use separate package-level configurations. The Docker-backed
runners generate an isolated Compose project name and a dynamically published
host port, so these three suites do not need to share a database container or
port.

## Suites that must run one at a time

Run these suites serially, waiting for each command to finish before starting
the next one:

- `oceanbase`
- `oracle`
- `mssql`
- `dameng`

Example:

```bash
pnpm --filter @nocobase/db-oceanbase test:integration && \
pnpm --filter @nocobase/db-oracle test:integration && \
pnpm --filter @nocobase/db-mssql test:integration && \
pnpm --filter @nocobase/db-dameng test:integration
```

Keeping these suites serial avoids competing for the heavier or more sensitive
database services and their initialization steps. In particular, MSSQL and
Dameng run additional init services before the tests; Oracle and OceanBase also
have substantially higher startup and resource requirements than the lightweight
parallel group.

## Running the complete set

The existing `@nocobase/db` `test:integration:all` script is intentionally
conservative and runs every dialect serially:

```bash
pnpm --filter @nocobase/db test:integration:all
```

When a full verification is required, run the `sqlite`/`postgres`/`mysql` group
in parallel first, then run `oracle`/`mssql`/`dameng`/`oceanbase` using the
serial chain above. Do not append the serial-only suites to background jobs from
the parallel group. For normal development, prefer the default SQLite command
and opt into only the dialect under change.

## Environment and cleanup

The integration runner chooses a random Compose project name and removes its
containers, volumes, and orphan services when the suite exits. Set
`KEEP_TEST_DB=1` only when debugging and you need to inspect the database after
the run. If a run is interrupted, verify that no leftover Compose services are
still using resources before starting another serial-only suite.

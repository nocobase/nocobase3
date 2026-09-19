# Database development tools

Runnable examples, the commerce playground, and numeric benchmarks live here as consumers of `@nocobase/db` and its dialects. Their dependencies belong to the repository root, so neither the core package nor `db-testkit` depends on a dialect, even during development. This directory is not a published workspace package.

Run these commands from the repository root:

```sh
pnpm db:example list
pnpm db:example all --cleanup
pnpm db:playground
pnpm db:benchmark --databases=sqlite --rows=1000 --writes=2 --repeats=1 --warmups=0
pnpm db:check
```

The root `lint`, `typecheck`, and `test` commands include these tools. Tests live under `tests/`. Commands run with `dev/db` as their working directory, so relative benchmark output paths and retained example databases stay here.

Examples and the playground use the public database API. The numeric benchmark also imports two internal aggregate helpers for SQL controls and hashes the measured core source files; those deliberate source references belong to this repository-only benchmark, not to a published API.

Core unit and generic type tests belong to `packages/libs/db/tests`. Driver-specific type and runtime tests belong to the corresponding dialect. Shared integration contracts stay in `packages/libs/db-testkit/tests/integration` and receive the adapter supplied by each dialect's integration entry point.

## Test published packages locally

Use Node 24+, pnpm 11, and a running Docker daemon. Install workspace dependencies first. The local registry commands reuse CI's isolated Verdaccio configuration and application smoke test; they publish the current checkout without changing package versions or creating Git tags.

```bash
pnpm local-registry:prepare
pnpm local-registry:create my-app --template default
pnpm local-registry:verify --template default
pnpm local-registry:verify --template examples
pnpm local-registry:verify --template hub
pnpm local-registry:stop
```

`prepare` starts Verdaccio on `127.0.0.1:4873` (`--port` selects another port), builds every publishable package except docs, and publishes them to that registry. Workspace packages cannot fall back to upstream artifacts; other dependencies use the normal upstream proxies. The command checks both npm and pnpm registry settings before publishing and uses a private temporary npmrc and separate client caches. It also assigns `latest` locally and prints a manual creation wrapper that invokes `pnpm create` with the exact snapshot versions. Run that wrapper outside the repository; it accepts `--template default|examples|hub`, `--dialect`, and `--json`. The registry remains available until `stop`.

`verify` defaults to the Default template and SQLite. It creates an application, installs dependencies, validates JSON output, synchronizes Skills, and verifies dev, build, and production start. `--timeout 420` sets the readiness timeout in seconds for each server. `--workdir /absolute/empty/directory` selects an empty output directory outside the repository; otherwise a temporary directory is allocated. Applications and logs are retained on success or failure, while application processes are stopped. `verify` enables `NOCOBASE_STRICT_STARTUP=true` for dev and start so startup failures exit nonzero, including job import failures. The existing shared smoke test exercises all three templates' dev/build/start scripts.

For a server database, provide a dedicated test database that migrations and seeds may modify:

```bash
pnpm local-registry:verify --template default --dialect postgres --config /path/to/postgres-test.yml
```

The configuration file must contain `database.connections.main` with the matching `dialect` and actual connection settings. Only that connection is merged into the generated `config.yml`; generated secrets and other connections are preserved. No database service is provisioned and no credentials are printed by the configuration merge. The resulting configuration is private local data; do not commit test credentials.

To test another code snapshot, run `stop` and then `prepare` again. A fresh registry and isolated caches avoid reinstalling stale artifacts with the same package version. `stop` deletes the session's registry, credentials, and caches, but keeps generated applications and logs. Existing applications may need a new install against an available registry after cleanup. If preparation fails, inspect its output and run `stop` before retrying. These commands operate on the current checkout's session and refuse concurrent preparation, verification, or cleanup.

`pnpm local-registry:create <name>` creates an application for manual development and installs dependencies without starting or automatically testing it. Applications default to the `nocobase-local-apps/` directory beside this repository; use `--output-dir /absolute/parent` to choose another parent directory. The command uses the prepared registry and exact snapshot versions, supports `--template default|examples|hub`, `--dialect`, `--json`, and `--no-install`, and refuses a nonempty application directory or a location inside the repository. JSON mode preserves create-app's single JSON result. For example, `pnpm local-registry:create crm --dialect postgres --json` generates the connection settings; edit the new application's `config.yml` before starting it. `stop` does not delete these applications.

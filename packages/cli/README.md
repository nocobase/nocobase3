# @nocobase/nb3-cli

NocoBase 3 command-line tools and the internal runner for application-management scripts included in generated apps.

The package exposes both command surfaces:

- `nb3` remains available with the existing app and Hub command tree
- `nocobase-app` backs the package scripts in generated apps

Application developers normally use the project-local scripts:

```bash
pnpm run pull
pnpm run push
pnpm run release --bump patch --non-interactive
pnpm run deploy
pnpm run status --json
pnpm run hub:login --hub https://hub.example.com/hub
pnpm run hub:logout --hub https://hub.example.com/hub
```

## Application scripts

| Script       | Purpose                                                                               |
| ------------ | ------------------------------------------------------------------------------------- |
| `pull`       | Pull the latest Hub source snapshot without overwriting divergent local source        |
| `push`       | Push the current source snapshot without transferring local Git history               |
| `release`    | Synchronize source, build, and upload an immutable Release without deploying it       |
| `deploy`     | Run the full first-deploy flow, or deploy, roll back, or redeploy an existing Release |
| `status`     | Show Repository, Release, Deployment, and Runtime status                              |
| `hub:login`  | Authorize this device and save an Agent credential                                    |
| `hub:logout` | Revoke and remove the saved credential                                                |

Every script accepts `--help`. Agent-facing operations support non-interactive and JSON output where applicable.
Release and deployment operations also support dry-run validation and operation IDs for safe retries.

To initialize a new working copy from an existing Hub application, run:

```bash
pnpm create @nocobase/app crm \
  --hub https://hub.example.com/hub \
  --app sales
```

The working copy defaults to SQLite when `--db-dialect` is omitted, so the command also works unattended. Pass
`--db-dialect postgres` or `--db-dialect mysql` when the local environment should use another database.

Source snapshots deliberately exclude local Git history, dependencies, build output, runtime data, `.env`, `.npmrc`,
credentials, and local Hub-association state. A generated app stores its association in `.nocobase/config.json`;
credentials and operation journals live under `~/.nocobase` by default.

Bare `pnpm run deploy` associates or creates the Hub application when necessary, pushes the source snapshot, creates
the next patch Release, and deploys it. `pnpm run deploy --release`, `--rollback`, and `--redeploy` operate on existing
Releases instead. `pnpm run release` creates a Release without deploying it.

## `nb3` command surface

The existing executable remains part of the published package:

```bash
nb3 --help
nb3 app --help
nb3 hub --help
```

## Implementation

The app-facing command tree lives under `src/app-scripts/`. Each entry reuses focused implementations from
`src/commands/` and `src/lib/` so the package scripts and the `nb3` surface do not duplicate lifecycle logic.
`bin/app.js` loads the app-script surface, while `bin/run.js` loads the existing `nb3` surface.

```bash
node ./bin/app.js release --help
node ./bin/run.js --help
pnpm --filter @nocobase/nb3-cli lint
pnpm --filter @nocobase/nb3-cli typecheck
pnpm --filter @nocobase/nb3-cli test
pnpm --filter @nocobase/nb3-cli build
```

Set `NB3_CLI_USE_DIST=1` to exercise compiled command files from the source checkout.

## Local state

- User credentials and operation journals live outside app source under `~/.nocobase`
- App-local Hub identity lives in `.nocobase/config.json`
- `NOCOBASE_CLI_ROOT` overrides the user-state root; `NB3_CLI_ROOT` remains accepted for compatibility
- Hub workflow exit codes are `2` for local input or artifact errors, `3` for authentication, `4` for authorization,
  `5` for Hub state conflicts, `6` for network or server failures, and `7` for app build failures

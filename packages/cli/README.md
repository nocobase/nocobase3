# @nocobase/nb3-cli

NocoBase 3 internal command-line tools. This package is distributed as a development dependency of generated apps; it
is not intended for global installation.

It exposes two executable surfaces:

- `nb3` provides the internal app, plugin, and Hub command tree.
- `nocobase-app` backs the application-management scripts in generated apps.

Application developers normally use the project-local `pnpm` scripts described below instead of invoking either
executable directly.

## Application-management scripts

| Script       | Purpose                                                                               |
| ------------ | ------------------------------------------------------------------------------------- |
| `release`    | Build locally and upload an immutable Release without deploying it                    |
| `deploy`     | Run the full first-deploy flow, or deploy, roll back, or redeploy an existing Release |
| `status`     | Show application, Release, Deployment, and Runtime status                             |
| `hub:login`  | Authorize this device and save an Agent credential                                    |
| `hub:logout` | Revoke and remove the saved credential                                                |

```bash
pnpm run release --bump patch --non-interactive
pnpm run deploy --hub https://hub.example.com/hub
pnpm run status --json
pnpm run hub:login --hub https://hub.example.com/hub
pnpm run hub:logout --hub https://hub.example.com/hub
```

Every script accepts `--help`. Agent-facing operations support non-interactive and JSON output where applicable.
Release and deployment operations also support dry-run validation and operation IDs for safe retries.

Application source stays on the developer machine. Hub stores build artifacts and manages Releases, Deployments, and
Runtime state; it does not store, download, or edit source. A generated app stores its Hub association in
`.nocobase/config.json`, while credentials and operation journals live under `~/.nocobase` by default.

A new Hub starts with an empty application list. On the first deployment, omit `--app` to create an application from
the local project name, or pass `--app <slug>` to bind an application that was created in Hub explicitly:

```bash
pnpm run deploy --hub https://hub.example.com/hub
pnpm run deploy --hub https://hub.example.com/hub --app sales
```

After a successful association, `pnpm run deploy` reuses the saved Hub and application identity. Use
`pnpm run deploy --release`, `--rollback`, or `--redeploy` to operate on existing Releases. Use `pnpm run release` to
create a Release without deploying it.

## Plugin scripts

Generated apps also expose project-local scripts for plugin registration and skill synchronization:

| Script                    | Internal command             | Purpose                                                        |
| ------------------------- | ---------------------------- | -------------------------------------------------------------- |
| `pnpm plugin:register`    | `nb3 app plugin register`    | Install and register a plugin                                  |
| `pnpm plugin:unregister`  | `nb3 app plugin unregister`  | Remove the plugin registration and package                     |
| `pnpm plugin:update`      | `nb3 app plugin update`      | Upgrade registered plugins and synchronize their Agent skills  |
| `pnpm plugin:skills:sync` | `nb3 app plugin skills sync` | Synchronize Agent skills without upgrading plugin packages     |
| `pnpm client:inspect`     | App-local inspector          | Inspect the final client plugin, route, and settings ownership |

Plugin registration updates the package dependency, `nocobase.plugins`, and the explicit Client and Server composition
roots for the exports a plugin provides. The same implementation is shared with repository-level plugin scripts through
workspace mode. Full usage and flags are documented in [docs/cli](../../docs/cli/README.md).

## `nb3` command surface

The existing executable remains part of the published package:

```bash
nb3 --help
nb3 app --help
nb3 app plugin --help
nb3 hub --help
```

The command source lives under `src/commands/`; the directory structure is the command structure. The generated-app
surface lives under `src/app-scripts/` and reuses the same focused implementations from `src/commands/` and `src/lib/`.
`bin/run.js` loads the `nb3` surface, while `bin/app.js` loads the application-script surface.

## Development

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

- User credentials and operation journals live outside app source under `~/.nocobase`.
- App-local Hub identity lives in `.nocobase/config.json` and is written atomically after a successful association.
- `NOCOBASE_CLI_ROOT` overrides the user-state root; `NB3_CLI_ROOT` remains accepted for compatibility.
- Hub workflow exit codes are `2` for local input or artifact errors, `3` for authentication, `4` for authorization,
  `5` for Hub state conflicts, `6` for network or server failures, and `7` for app build failures.

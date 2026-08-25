# @nocobase/nb3-cli

NocoBase 3 command-line tool. The executable name is `nb3`.

See [`nb3 app`](../../docs/cli/nb3-app.md) and [`nb3 hub`](../../docs/cli/nb3-hub.md) for usage documentation.

## Commands

### App commands

| Command           | Purpose                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `nb3 app create`  | Create a local app, or create one in a Hub with `--hub` and clone its source repository |
| `nb3 app pull`    | Clone an existing Hub app source repository                                             |
| `nb3 app dev`     | Run the app project's `dev` script with its own package manager                         |
| `nb3 app publish` | Push clean source, build and upload a Release, and optionally deploy it                 |
| `nb3 app deploy`  | Deploy, roll back, or redeploy an existing Hub Release                                  |
| `nb3 app status`  | Show Repository, Release, Deployment, and Runtime status                                |
| `nb3 app list`    | List apps available to the current Hub credential                                       |
| `nb3 app info`    | Show local app metadata and dependency status                                           |
| `nb3 app config`  | Read or update `.nb3/config.json`                                                       |
| `nb3 app destroy` | Delete a local app directory with confirmation and path checks                          |

### Hub commands

| Command           | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `nb3 hub login`   | Authorize this device and save an Agent credential        |
| `nb3 hub logout`  | Revoke and remove the saved credential                    |
| `nb3 hub create`  | Create a local Hub project from the Hub package           |
| `nb3 hub start`   | Start a Hub in the background, or use `--foreground`      |
| `nb3 hub dev`     | Start a Hub in development mode                           |
| `nb3 hub restart` | Stop and start a Hub                                      |
| `nb3 hub status`  | Show the process, URL, and deployed app count             |
| `nb3 hub stop`    | Stop the Hub process group and remove stale process state |
| `nb3 hub logs`    | Read or follow Hub logs                                   |
| `nb3 hub open`    | Open the Hub application console                          |

Hub workflow mutations use idempotency keys and a local operation journal. Agent-facing commands provide non-interactive and JSON output where applicable; publishing and deployment also support dry-run validation.

The default app template is `@nocobase/app-template-default@beta`, and the default Hub package is `@nocobase/hub@beta`. Both are downloaded from `https://npm.nocobase.ai`. Override either package or the registry when needed:

```bash
nb3 app create crm --template @nocobase/app-template-default@0.0.1
nb3 app create crm --registry https://registry.npmjs.org
nb3 app create crm --template ./packages/app-template-default
nb3 hub create my-hub --template ./packages/hub
```

## Development

Command files under `src/commands/` mirror the CLI hierarchy. For example, `src/commands/app/create.ts` implements `nb3 app create`.

```bash
node ./bin/run.js app create crm
pnpm --filter @nocobase/nb3-cli build
pnpm --filter @nocobase/nb3-cli check
```

`bin/run.js` loads TypeScript sources inside the repository and compiled files from `dist` in a published installation. Set `NB3_CLI_USE_DIST=1` to exercise the compiled package from the source checkout.

## Conventions

- User state lives under `~/.nb3/`; set `NB3_CLI_ROOT` to override it
- App- and Hub-local state lives under `.nb3/`
- Environment variables use the `NB3_` prefix
- Hub workflow exit codes are `2` for local input or artifact errors, `3` for authentication, `4` for authorization, `5` for Hub state conflicts, `6` for network or server failures, and `7` for app build failures

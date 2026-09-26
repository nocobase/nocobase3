# @nocobase/hub-installer

Installs a NocoBase 3 Hub on a server and reports its state, for a Hub whose source you do not change. It generates the Hub from the published `@nocobase/app-template-hub`, builds it on the server, keeps only the deployment archive, and runs it under pm2. A Hub you customise is an application project: create it with `pnpm create @nocobase/app hub --template=hub` and deploy it like any other application. Docker remains the other way to run an unmodified Hub.

## Requirements

- Linux or macOS. On Windows, use WSL: switching releases relies on symbolic links and atomic renames.
- Node.js 24 or later, pnpm 11 or later, and `tar`.
- pm2 installed globally (`npm install -g pm2`) to start the Hub. A copy fetched through `npx` does not work, because `pm2 startup` writes a boot service that names pm2's own path.

## Install

```bash
npx @nocobase/hub-installer install /srv/nocobase/hub --origin https://apps.example.com
```

The target must be new or empty. Before writing anything, the command also checks that the port is free, that no pm2 process already uses the name (`pm2 start` on a taken name would restart that process with this Hub's configuration rather than start a new one), and that every variable named by `--set-from-env` is set. It then resolves the version, generates and builds the Hub in a temporary build directory, unpacks the deployment archive into a release directory, writes the configuration, applies the database migrations, and starts the Hub with pm2, waiting until its health check answers or pm2 reports the process as crashed. Anything it wrote is removed again if it fails before the Hub is switched on, so running it again starts clean — with `--keep-source`, the build directory is kept for inspection and has to be removed before retrying.

Ctrl-C (or SIGTERM) stops the step that is running and lets that cleanup happen; a second one exits at once.

| Flag               | Default                   | Purpose                                                                                   |
| ------------------ | ------------------------- | ----------------------------------------------------------------------------------------- |
| `--hub-version`    | `latest`                  | Template version or dist-tag. Resolved to an exact version before anything is built.      |
| `--origin`         | `http://HOST:PORT`        | Public origin without `/hub`. Set it before exposing the Hub.                             |
| `--host`, `--port` | `127.0.0.1`, `13000`      | Where the Hub listens. Keep the loopback default behind a reverse proxy.                  |
| `--dialect`        | `sqlite`                  | Database. Anything else adds `@nocobase/db-<dialect>` before the build and needs `--set`. |
| `--set`            |                           | `key=value` passed to `nocobase config set`, repeatable. Values are YAML scalars.         |
| `--set-from-env`   |                           | `key=VARIABLE` read from the environment, repeatable. Use it for passwords.               |
| `--registry`       | `https://npm.nocobase.ai` | Registry for the template and NocoBase packages; `NOCOBASE_REGISTRY` also sets it.        |
| `--name`           | `nocobase-hub`            | pm2 process name.                                                                         |
| `--no-start`       |                           | Install without starting; the result names the command that starts it.                    |
| `--health-timeout` | `180`                     | Seconds to wait for the health check.                                                     |
| `--keep-source`    |                           | Keep the build directory, with the sources and development dependencies, even on failure. |
| `--json`           |                           | Print one JSON result on stdout. Progress always goes to stderr.                          |

A PostgreSQL Hub, with the password taken from the environment:

```bash
HUB_DB_PASSWORD=... npx @nocobase/hub-installer install /srv/nocobase/hub \
  --origin https://apps.example.com --dialect postgres \
  --set database.connections.main.host=db.internal \
  --set database.connections.main.username=hub \
  --set-from-env database.connections.main.password=HUB_DB_PASSWORD
```

`--set` values are read as YAML scalars by `nocobase config set`: `0123` becomes the number `123` and `no` becomes `false`, so quote text that looks like either, as in `--set 'key="0123"'`. Values are masked in the installer's own output, but a secret passed with `--set` is still visible to other users in the process list while the command runs; pass secrets with `--set-from-env`.

Afterwards, run `pm2 startup` once and execute the command it prints so pm2 restarts the Hub after a reboot, and proxy the origin to the Hub with `location /` and `client_max_body_size 260m`. The first sign-in comes from `users.initialAdmin` in `config.yml`; the template default is `nocobase` / `admin123`, to be changed after signing in.

## Status

```bash
npx @nocobase/hub-installer status --dir /srv/nocobase/hub
```

Reports the current version, whether the Hub answers its health check, the pm2 process, the releases on disk and their size, whether the machine's Node major still matches the one the release was built for, and whether the registry has a newer version (`--offline` skips that). It changes nothing, and does not start the pm2 daemon when it is not running.

## Layout

```text
/srv/nocobase/hub/
├── hub.env               runtime variables, read by pm2 and by every hub-installer command
├── config.yml            written by `nocobase config init`, shared by every release
├── storage/              HUB_STORAGE_DIR: the Hub's database, uploaded releases and hosted applications
├── logs/                 the Hub's stdout and stderr, collected by pm2
├── ecosystem.config.cjs  the pm2 configuration every start goes through
├── releases/<version>/hub/  dist/ and config.example.yml from the deployment archive
├── current -> releases/<version>/hub
└── installer.json        what the installer knows: current version, dialect, drivers, history
```

`APP_CONFIG_FILE` and `HUB_STORAGE_DIR` in `hub.env` are absolute. A built server treats the directory above `dist/` as its deployment root and would otherwise keep its configuration and data inside the release directory.

pm2 runs `node` itself with `dist/server/standalone.js` as its argument (`interpreter: 'none'`). Pointing pm2's `script` at `standalone.js` would load it through pm2's own wrapper, where `import.meta.main` is false, and the Hub would never start. pm2 also keeps the release path it resolved at `pm2 start`, so after `current` changes the process has to be deleted and started again rather than restarted.

## Exit codes

| Code | Meaning                                                                                    |
| ---- | ------------------------------------------------------------------------------------------ |
| `0`  | Success.                                                                                   |
| `1`  | The operation failed. A Hub that was already running was not touched.                      |
| `2`  | Invalid usage or a failed precheck, including an unsupported Node.js; nothing was written. |

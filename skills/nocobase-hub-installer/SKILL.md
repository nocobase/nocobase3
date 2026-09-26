---
name: nocobase-hub-installer
description: Install, upgrade, roll back and check a NocoBase 3 Hub on a server with `@nocobase/hub-installer`, for a Hub whose source is not changed. Use when the user asks to install, deploy, upgrade or roll back a NocoBase Hub, or when the directory holds an `installer.json` written by hub-installer. Not for developing or customising a Hub, which is an application project, and not for publishing an application to a Hub.
---

# Run a NocoBase 3 Hub with hub-installer

`@nocobase/hub-installer` builds the published Hub template on the server, keeps only its deployment archive under `releases/<version>/hub`, and runs it under pm2. `config.yml`, `hub.env` and `storage/` sit beside the releases and survive every upgrade. This Skill decides when to use it and how to act on what it reports; `--help` is the reference for every flag.

## Run it

Every command goes through `npx` with the registry named, and with `--json`:

```bash
npx --registry="${NOCOBASE_REGISTRY:-https://npm.nocobase.ai}" @nocobase/hub-installer <command> … --json
```

NocoBase 3 publishes to `https://npm.nocobase.ai`, not to the public npm, so a bare `npx @nocobase/hub-installer` answers 404. `NOCOBASE_REGISTRY` is set only when someone points the shell at another registry, such as an unreleased snapshot; the installer reads the same variable for the Hub template.

`--json` prints one document on stdout and progress on stderr. Read the document, not the exit code alone: `ok`, `status` (`success`, `success-noop` or `error`), `result`, and on failure `error.code`, `error.message`, `error.suggestions` (each a `message` and, where there is one, a `run` command) and `error.details`.

| Exit | Meaning                                                                                 |
| ---- | --------------------------------------------------------------------------------------- |
| `0`  | Done, or nothing to do (`success-noop`).                                                |
| `1`  | Failed; a Hub that was already running was not touched.                                 |
| `2`  | Invalid usage, a failed precheck, or a confirmation still needed; nothing was written. |
| `3`  | An upgrade failed after switching and was rolled back; the previous release is running. |
| `4`  | Rolling back failed too; the Hub is down.                                               |

## Choose the route

Settle this with the user before installing anything:

- The Hub's source will change — its own code or plugins: it is an application project. Create it with the `nocobase-create-app` Skill and `--template=hub`, and deploy it with that project's own `nocobase-deployment` Skill.
- Docker is available and preferred: follow the Docker section of the Hub deployment documentation instead, https://github.com/nocobase/nocobase3/blob/develop/docs/docs/en/app/deployment/hub.md.
- Otherwise, an unmodified Hub on a server with Node.js: this Skill.

When the working directory already holds `installer.json`, the Hub exists: start with `status`.

## Install

1. Check the server: `node --version` (24 or later), `pnpm --version` (11 or later), `tar --version`, and `pm2 --version`. pm2 has to be installed globally, `npm install -g pm2`; a copy fetched through `npx` breaks `pm2 startup`. Report what is missing with the command that installs it, and install nothing globally unless the user asks. On Windows, work in WSL.
2. Settle with the user: the target directory, new or empty, such as `/srv/nocobase/hub`; the public origin without `/hub`, such as `https://apps.example.com`; the port, 13000 by default; and the database, SQLite by default.
3. Run `install <dir> --origin <origin> --json`, adding `--port` when it is not 13000. For another database add `--dialect <dialect>`, the connection as `--set database.connections.main.host=…` and friends, and the password as `--set-from-env database.connections.main.password=<VARIABLE>` after the user has exported it. It builds on the server and takes a few minutes.
4. When `result.started` is true, the Hub answered its health check. Tell the user:
   - `result.url`, and the first sign-in from `users.initialAdmin` in `config.yml` — the template default is `nocobase` / `admin123`, to be changed after signing in;
   - that `pm2 startup` prints a command they run once with sudo, so the Hub comes back after a reboot;
   - that the reverse proxy forwards the whole origin with `location /` to the Hub's port, with `client_max_body_size 260m` and the WebSocket upgrade headers.

A failed install before the switch leaves the target as it found it; `error.details.output` holds the failing step's output. `START_FAILED` means installed but not running: show `error.details.log`.

## Status

`status --dir <root> --json` changes nothing. Report `current`, `health.ok`, `process`, `updateAvailable`, and anything in `warnings`. `node.matches: false` means the machine's Node major changed since the release was built, and the release will not load its native modules until an upgrade rebuilds it. A non-null `pending` means an operation was interrupted; see below.

## Upgrade and roll back

Both stop the Hub and every application it hosts, so the user decides:

1. Run `upgrade --dir <root> --json` without `--yes`. It answers `CONFIRMATION_REQUIRED` with `error.details.notes`: what will stop, what is backed up, and any Node major change. Relay those notes and wait for a clear yes before running it again with `--yes`. `success-noop` means the Hub is already on that version.
2. On any database but SQLite, the installer backs up nothing: have the user back the database up first, then add `--backup-done`.
3. Read the outcome:
   - Exit 0: report `result.from`, `result.to`, `result.migrations` and `result.backup`, and that deployments which were in progress show as failed and need starting again in the Hub.
   - Exit 3: the previous release runs again. Report `error.message` and `error.details.log`, and leave the next attempt to the user once the cause is known.
   - Exit 4: the Hub is down. Work through `error.suggestions` with the user, step by step.

`rollback --dir <root> --json` returns to the release the last upgrade came from, or to `--to <version>`. When that upgrade migrated the database, rolling back restores the backup taken before it and loses whatever the Hub stored since; the confirmation notes say so, and the same relay-and-confirm step applies. `--no-restore` keeps the current database.

## Recover an interrupted operation

`OPERATION_INTERRUPTED` from `upgrade`, or `pending` in `status`, means an earlier run stopped while the Hub was down. Plain `rollback` recovers, through the same confirmation: it undoes an interrupted upgrade, restoring the database, and finishes an interrupted rollback.

## Keep the Hub's data intact

The root holds the Hub's only copy of its configuration, secrets and data. Change it only through hub-installer: keep `config.yml`, `hub.env`, `storage/`, `backups/` and `installer.json` as they are, and leave the choice of deleting anything to the user. Keep the contents of `config.yml` and `hub.env` out of the conversation.

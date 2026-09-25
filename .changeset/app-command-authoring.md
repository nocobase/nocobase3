---
'@nocobase/app-cli': major
---

Commands are written against `AppCommand`, exported from the package root, which replaces the `./plugins` entry. `defineCliPlugin`, `defineCliPlugins` and the hook types move to the root too: import them from `@nocobase/app-cli`.

- `this.rootDir` is the application root the runner located, and `this.withApp(async ({ app, env }) => …)` creates the application, runs the callback, and always shuts it down and destroys its runtime, including a half-built one a failing `createApp` left behind. The application is created, not started.
- `appPath({ description, default })` declares a path flag whose value arrives absolute: a typed value resolves from the current directory, and the default from the application root.
- `run()` returns the command's result and throws `CommandError` (`code`, `suggestions`, `details`, `exit`) on failure. `--json` comes from `AppCommand`, and every command prints the same envelope: `{ schemaVersion: 1, ok, command, status, result | error, warnings }`, where `status` is `success`, `success-noop`, `partial-success` or `failure`. `NOCOBASE_CONTENT_TYPE=json` enables it for every command.
- **Breaking for anything that parses `--json`.** Fields commands printed at the top level are now under `result`; failures carry `error.code`, `error.suggestions` (`{ message, run? }`) and `error.details`; `operation` is replaced by `command` (`release upload`, not `release:upload`). `config init`'s `unchanged` is `success-noop`, and a failed `config check` lists its findings in `error.details.findings`. `plugin register --dry-run` for an uninstalled plugin is `partial-success` with `result.state: "requires-installation"`. Exit codes are unchanged, except that invalid usage now exits 2 consistently.
- `this.exit()` and `this.logJson()` are refused in an `AppCommand`, and warnings go to `warnings` under `--json` instead of being dropped. A failure outside any command — an unknown command, a broken plugin entry — still answers `--json` with one document.
- The runner closes a runtime a command left open and names the command on stderr. What an application logs while a command runs goes to stderr, so stdout carries only the command's output.
- `@nocobase/app-cli/testing` exports `bindAppCommand(Command, { rootDir, loadRuntime?, createApp?, id? })` and `runAppCommand(Bound, argv)` for testing commands without the runner.

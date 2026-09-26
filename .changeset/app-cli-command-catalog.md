---
'@nocobase/app-cli': minor
'@nocobase/app-skills': patch
---

`nocobase commands` lists every command registered where it runs — the built-in ones, the application's `app` commands and each registered plugin's — and `--json` returns them as data for agents and scripts: `{ commands, topics }`, each command with its `id` (`db apply`), `summary`, `description`, `source` (`builtin`, `app` or `plugin`, with the plugin's `package`), `developmentOnly`, whether it takes `--json`, `--dry-run` and `--force`, its `args`, its `flags` (`name`, `char`, `type`, `description`, `required`, `multiple`, a static `default`, `options`) and its rendered `examples`. In a built `dist/` it lists no development command.

Invalid usage answers with what was probably meant. A nonexistent flag suggests the closest flags (`Did you mean --connection?`) and the command's `--help`; an unknown command suggests the closest command ids with the command to run each, and `pnpm nocobase commands --json`. The message names the command's own flags, arguments and allowed values and never repeats a value that was typed, since a mistyped command line can leave a secret anywhere in oclif's wording; it no longer ends with oclif's "See more help with --help". A value a flag's parser rejects is reported as `INVALID_USAGE` with exit code 2 instead of `UNEXPECTED`, and every usage failure keeps exit code 2. Without `--json` the suggestions print under "Try this:". With `NOCOBASE_CLI_DEBUG` set, a failure's diagnostics print once, and oclif's own raw stack no longer replaces the message and its suggestions.

The application Skills point agents at `pnpm nocobase commands --json` for the whole command tree.

Piping a command's output into a reader that stops early, such as `| head`, no longer ends the run with exit code 13 and an "unsettled top-level await" warning: the runner stops waiting for stdout once the reader has closed it.

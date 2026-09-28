---
'@nocobase/app-cli': patch
---

The `--json` envelope and its types — `CommandSuccessJson`, `CommandFailureJson`, `CommandJson`, `CommandErrorJson`, `CommandSuggestion` and `COMMAND_JSON_SCHEMA_VERSION` — now come from the new `@nocobase/cli-envelope` dependency and are re-exported unchanged, so a command author still imports them from this package. `bin/run.js` runs that package's Node.js guard: under `--json` an unsupported Node.js now prints the failure document with `NODE_UNSUPPORTED` on stdout instead of only text on stderr, and the text names the tool as `[nocobase]` as before.

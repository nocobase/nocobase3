---
'@nocobase/app-host': patch
'@nocobase/app-server': patch
'@nocobase/logging': patch
---

Restore colored log levels in the development terminal. Replacing the pino-pretty transport with `console.pretty` dropped the ANSI escapes, so INFO, WARN and ERROR lost the colors developers had in v2. Pretty output colors the level label again, using the previous palette, and only when it helps: `console.color` decides when set, otherwise a terminal check applies, `NO_COLOR` disables the escapes, `FORCE_COLOR` requests them, and piped or captured output stays plain. Structured console output, journals and log files still never contain escapes. Applications pass an explicit `logging.console.color` (or `hub.logging.apps.console.color`) through to the logging library. A managed App Host child inherits a pipe and cannot see the terminal its output is relayed to, so the supervisor requests `FORCE_COLOR` for it when the environment states no preference, and captured child output drops terminal escape sequences so the Hub log viewer keeps showing readable text.

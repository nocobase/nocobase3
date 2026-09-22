---
"@nocobase/app-server": patch
"@nocobase/app-cli": patch
---

Report a connection whose Collection artifacts have never been generated as one line instead of one per expected file.

`collections generate --check` compares the database with `database/<connection>/collections/` and reports every expected file it cannot read as `missing`. When the directory does not exist at all — the state of any application that has not run the command yet — that is three lines per Collection plus the manifest, none of which says anything the first one did not: an application with 41 Collections printed 124 of them. The result now carries `directoryExists` in check mode so the two cases can be told apart, and the command prints the count and what to run instead of the list. `--json` still carries every difference.

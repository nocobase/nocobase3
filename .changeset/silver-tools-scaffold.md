---
'@nocobase/create-plugin': minor
---

Add a `cli` capability and a `--with all` shorthand

`pnpm plugin:create <name> --with cli` scaffolds a `cli/` entry with one example command, the `./cli` export, and the peer dependencies an application resolves it through. `--with all` selects every capability, so a plugin that needs most of them no longer means naming each one.

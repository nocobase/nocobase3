---
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

The Default template registers the scheduler's command-line entry in `cli/plugins.ts`, so `pnpm nocobase scheduler sync` exists in a Default application as the scheduler documentation describes. The Examples and Hub templates ignore `/.env` like the Default template does, all three Docker build contexts keep `@nocobase/app-cli`'s `dist` command sources, and the agent guidance and READMEs describe the current layout: `package.json` scripts that call `nocobase`, `cli/plugins.ts`, the two scripts a built `dist/` carries, and hand-written external metadata under `database/<connection>/metadata/`.

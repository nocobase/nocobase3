---
'@nocobase/app-template-default': patch
'@nocobase/nb3-cli': patch
'@nocobase/hub': patch
---

Move Hub deployment into the generated App's `pnpm run deploy` script and remove the obsolete `nb3 app deploy` command.

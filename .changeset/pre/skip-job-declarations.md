---
'@nocobase/app-server': patch
---

Exclude TypeScript declaration files from plugin queue job discovery so installed plugins do not attempt to execute .d.ts or .d.mts files during startup.

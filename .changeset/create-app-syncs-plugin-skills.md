---
'@nocobase/create-app': patch
---

Synchronize plugin skills into a generated app after its dependencies are installed. The sync resolves plugins out of `node_modules`, so it can only run after the install; `create-app` now runs the app's own `plugin:skills:sync` script at that point, which leaves a new project carrying the skills of the plugins the template ships instead of an empty `.agents/skills/`.

Skills are an assistive layer rather than something the app needs to boot, so a failed sync is reported as a warning along with the command to run by hand, and the generated project is still reported as created.

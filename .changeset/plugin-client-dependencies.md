---
'@nocobase/app-plugin-ai-employee': patch
'@nocobase/app-plugin-ai-knowledge-base': patch
'@nocobase/app-plugin-authentication': patch
'@nocobase/app-plugin-authorization': patch
'@nocobase/app-plugin-file': patch
'@nocobase/app-plugin-hub': patch
'@nocobase/app-plugin-install': patch
'@nocobase/app-plugin-notification': patch
'@nocobase/app-plugin-notification-provider': patch
'@nocobase/app-plugin-workflow': patch
'@nocobase/app-plugin-registry-example': patch
'@nocobase/app-plugin-repository-example': patch
'@nocobase/app-plugin-routes-example': patch
'@nocobase/create-plugin': patch
---

Declare the packages each plugin's client code imports, so an application that installs the plugin can resolve them.

A plugin's `client/` is not bundled by the plugin: `build` is `tsc`, so `dist/client/*.js` keeps its bare imports and the consuming application's Vite build resolves them. That application has only what the published manifest declares, and npm does not publish `devDependencies` — so a client import declared only there fails with `Could not resolve "…"`. `sonner` and `@xyflow/react` both shipped that way.

Ten of these plugins appeared to work because `app-template-default` happened to declare the same package for its own use. `@nocobase/app-plugin-hub` had no such coincidence: its CodeMirror imports were simply unresolvable wherever it was installed.

`react-router` moves to `peerDependencies` rather than `dependencies`, matching how `@nocobase/app-plugin-workflow` already declares it — a second copy of the router breaks rather than merely wasting space.

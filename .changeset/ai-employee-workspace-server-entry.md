---
'@nocobase/app-plugin-ai-employee': patch
---

Resolve `@nocobase/app-plugin-ai-employee/server` to source inside a source workspace

In a workspace that links the plugin, its root and `./server` entries pointed at the built `dist/` while `./server/plugin`, which an application registers the plugin from, pointed at source. An App importing `aiManagerToken` or `AIResourceRegistrar` from `./server` therefore loaded a second copy of the plugin, whose tokens the container filled by the first copy never matched, and a stale or missing `dist/` stopped the server at start. Both entries now resolve to source in the workspace, like every other entry and every other plugin. Published packages are unchanged: every entry already resolved to `dist/`.

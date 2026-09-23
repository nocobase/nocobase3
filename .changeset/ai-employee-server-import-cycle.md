---
'@nocobase/app-plugin-ai-employee': patch
---

Fix the server failing to start with `Cannot access 'aiManagerToken' before initialization`

The plugin's tools imported the container tokens they depend on from the same modules that register those tools, so its server modules formed an import cycle, and an application that loaded the plugin through its provider stopped at start. The tokens now live in a module of their own that imports nothing from the plugin, so no server module imports another that imports it back. Every token keeps its identity and its existing export paths.

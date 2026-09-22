---
"@nocobase/app-tools": patch
"@nocobase/app-template-default": patch
"@nocobase/app-template-examples": patch
"@nocobase/app-template-hub": patch
---

Use Execa to manage development process trees, preserve cleanup on repeated termination signals and launcher exit, and report startup progress. Remove automatic native watcher probes; polling is now explicitly configured.

Exclude installed dependencies from server file watching, including pnpm dependencies outside the application's directory.

---
'@nocobase/app-plugin-authentication': patch
---

Publish the `nocobase-app-plugin-authentication` Agent Skill with the package. It documents the plugin's public server and client surfaces and walks an application Agent through protecting routes, reading the session and customizing the sign-in pages, adding sign-in methods including a custom Better Auth plugin, managing account lifecycle, and deploying safely. Plugin registration synchronizes it into the application's `.agents/skills/`.

The package-local `docs/` directory is removed; its content now lives in the Skill and in the NocoBase documentation site.

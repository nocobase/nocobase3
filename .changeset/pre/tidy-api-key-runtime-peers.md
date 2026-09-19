---
'@nocobase/app-plugin-api-keys': patch
---

Declare the Better Auth API Key plugin's runtime peers explicitly so deployments with automatic peer installation disabled can load the plugin even when Better Auth's own dependencies are nested.

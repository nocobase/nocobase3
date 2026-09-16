---
"@nocobase/app-plugin-hub": patch
"@nocobase/app-template-default": patch
"@nocobase/app-template-examples": patch
---

Reject configured upload retries that omit the original deployment configuration and report known failed or cancelled deployment retries as CLI failures even without --wait.

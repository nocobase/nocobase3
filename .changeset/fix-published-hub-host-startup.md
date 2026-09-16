---
"@nocobase/app-host": patch
"@nocobase/app-template-hub": patch
---

Use the compiled Node entrypoint when Hub development requests the tsx driver from a published App Host package without source. Preserve source execution in the workspace and explicit entrypoint overrides. Document automatic selection and the compatibility override in the Hub template configuration example.

---
"@nocobase/app-template-default": patch
"@nocobase/app-template-examples": patch
"@nocobase/app-template-hub": patch
"@nocobase/app-skills": patch
---

Isolate temporary Vite caches used by client inspection and document cache ownership so diagnostics and tests cannot overwrite a running application's optimized dependencies.

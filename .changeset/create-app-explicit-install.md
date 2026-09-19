---
"@nocobase/create-app": patch
"@nocobase/app-skills": patch
---

Default generated applications to verifyDepsBeforeRun: false so running development, build, or startup scripts does not implicitly install dependencies. Document explicit installation after dependency changes and preserve template-provided settings.

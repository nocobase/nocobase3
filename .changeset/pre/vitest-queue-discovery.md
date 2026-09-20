---
'@nocobase/dev-config': patch
'@nocobase/app-skills': patch
---

Transform the queue loader in both Vitest presets so dynamically discovered TypeScript jobs load through the test runtime instead of Node's strip-only loader. Document the shared preset requirement for application job-discovery tests.

---
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
'@nocobase/create-app': patch
---

Replace the last references to command names the application command line no longer has. The Bubble reference page in each template now shows `pnpm nocobase db apply` instead of `pnpm migrate`, and a comment in `@nocobase/create-app` names `pnpm nocobase plugin inspect` instead of `pnpm client:inspect`.

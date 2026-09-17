---
'@nocobase/create-app': patch
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Explicitly disable the optional BullMQ MessagePack native accelerator's install script in generated applications and deployment workspaces, preventing pnpm 11 from blocking installation while preserving the JavaScript fallback.

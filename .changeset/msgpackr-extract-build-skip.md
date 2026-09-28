---
'@nocobase/create-app': patch
'@nocobase/app-cli': patch
---

Record `msgpackr-extract` as a deliberate install-script skip in generated applications and in the deployable `dist/`

It arrives through BullMQ in `@nocobase/jobs`. Skip its install script, which checks for a prebuilt binary and can fall back to a native source build. Optional platform packages can still supply the accelerator without running this script, and `msgpackr` falls back to JavaScript when none is usable. Recording the decision prevents strict pnpm installs from stopping with `ERR_PNPM_IGNORED_BUILDS`.

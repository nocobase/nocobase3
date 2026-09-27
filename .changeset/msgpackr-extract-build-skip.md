---
'@nocobase/create-app': patch
'@nocobase/app-cli': patch
---

Record `msgpackr-extract` as a deliberate install-script skip in generated applications and in the deployable `dist/`

It arrives through BullMQ in `@nocobase/schedule`. Its install script only looks for the prebuilt binary its platform package ships, and `msgpackr` falls back to JavaScript without it; left undecided, pnpm stops the install with `ERR_PNPM_IGNORED_BUILDS`.

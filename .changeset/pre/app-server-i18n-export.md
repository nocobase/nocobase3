---
'@nocobase/app-server': patch
'@nocobase/create-app': patch
---

Publish the `./i18n` subpath. `exports` declared it but `publishConfig.exports` did not, so it resolved from source in this repository and was absent from the published package. A generated application failed to start on `pnpm dev` with `ERR_PACKAGE_PATH_NOT_EXPORTED` for `./i18n`, imported by its own `server/app.ts`.

`pnpm pack:check` now compares `exports` against `publishConfig.exports` and rejects a subpath present in one and missing from the other, in either direction. This class of defect is invisible in the workspace — every consumer resolves through the source map — and only appears once the package is installed from a registry.

A generated application no longer stops its first install with `ERR_PNPM_IGNORED_BUILDS`. `tesseract.js` reaches the dependency tree through `officeparser` and its `postinstall` only prints a donation notice, so `allowBuilds` now records it as a deliberate `false` rather than leaving it undecided; entries accordingly carry their own value instead of always being written as `true`. The generated `pnpm-workspace.yaml` also sets `strictDepBuilds: false`, so a transitive dependency introduced later reports a skipped install script as a warning rather than failing the install of a project that is otherwise fine. The repository's own `pnpm-workspace.yaml` takes the same setting.

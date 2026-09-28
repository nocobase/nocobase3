---
"@nocobase/app-cli": patch
---

Fix cross-platform native retargeting to select supported platform packages and compatible declared versions from their owners' optional dependencies. Preserve already-compatible ownerless packages, reuse installed versions satisfying every owner's semver range, and validate downloaded versions against those constraints. Support packages that bundle glibc and musl binaries without a libc suffix, avoid redundant prebuild downloads for optional-package loaders, and keep unsupported targets and failed or incompatible downloads fatal.

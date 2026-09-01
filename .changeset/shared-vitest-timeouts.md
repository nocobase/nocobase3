---
'@nocobase/dev-config': patch
---

Raise the shared Vitest `testTimeout` and `hookTimeout` to 30 seconds. Vitest's 5-second default is a local-machine number: CI runs every package's suite in parallel on one shared runner, so work that finishes in under a second on a developer's machine can take several seconds there. A test that grows legitimately then fails as a timeout on CI long before it is slow enough to notice locally. A package that needs a different value still sets its own, which continues to take precedence over the shared one.

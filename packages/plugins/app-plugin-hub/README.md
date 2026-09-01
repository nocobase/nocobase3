# @nocobase/app-plugin-hub

The first-party control plane for applications run by a managed NocoBase App Host.

The initial implementation supports a single Hub-spawned Host and in-process Apps. It provides App creation, Release Artifact upload, Release-level configuration schemas, file configuration editing, deployment, restart, stop, and desired-state recovery after Hub startup.

Artifacts are stored through `@nocobase/drive`. File configuration defaults to `storage/app-volumes/<appId>/config.yml`, while expanded Releases are installed by the Host under `storage/app-deployments`.

The management API is restricted to system administrators. The browser page is available at `/hub`.

This version does not provide remote Hosts, multiple Hosts or environments, configuration publications, third-party configuration providers, or database migration rollback.

Set `HUB_HOST_ENABLED=false` only for processes that need Hub metadata without starting its local managed Host, such as composition-only tests.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-hub lint
pnpm --filter @nocobase/app-plugin-hub typecheck
pnpm --filter @nocobase/app-plugin-hub test
pnpm --filter @nocobase/app-plugin-hub build
```

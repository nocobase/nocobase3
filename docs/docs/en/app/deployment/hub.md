---
title: Deploy Hub
description: Run the Hub control plane and its managed App Host.
---

# Deploy Hub

Hub manages Releases, deployments, configuration and runtime operations. The current implementation starts one local managed App Host with in-process applications. It does not provide remote Host scheduling or per-App container isolation. If Hub is already available, continue with [Publish applications with Hub](./hub-publishing).

## Platform deployment

The repository publishes images to `ghcr.io/nocobase/hub` and `registry.cn-beijing.aliyuncs.com/nocobase/hub`, targeting amd64 and arm64, built from the Hub template's own `Dockerfile`. Verify an available tag or digest before use; workflow configuration alone does not prove a tag was published. Alternatively, scaffold the Hub template and build it with that `Dockerfile` (see [Standalone: Docker](./docker#1-build-the-image)), or build for the target platform with Node 24.

Applications are built for the environment Hub itself runs in, not for the server around it. The published image is based on Debian bookworm with Node 24, so a Docker deployment builds with `--target linux-x64` (or `linux-arm64`) and `--node-version 24` whatever the host runs; the Node version installed on the host, and whether the host is Alpine, do not apply. For a template deployment, read the values on the server that runs Hub with `uname -sm`, `node -p "process.versions.node + ' ABI ' + process.versions.modules"` and `ldd --version`. A Hub upgrade that changes the Node major version changes these flags, and already published applications must be rebuilt.

Configure a persistent storage directory, database and stable authentication/session secrets before starting. Set `APP_CONFIG_FILE` to the runtime configuration file and `HUB_STORAGE_DIR` to a writable persistent directory. With Docker, mount both explicitly and set the SQLite `database` path to a location inside the persistent mount. The image contains `/app/config.example.yml` as a configuration reference. Do not replace an existing runtime configuration with the template on upgrade.

## Public access

Use `APP_BASE_PATH=/hub`, set `APP_PUBLIC_ORIGIN` to the external origin without a path, and proxy the public site to Hub's application port. The standalone listener keeps `/hub` and its descendants in Hub and forwards other paths, including WebSocket upgrades, to its ready Host. Preserve Host and protocol information. Hosted applications can use paths such as `/crm`; the Host port does not need separate public exposure.

Visit `/hub/`, not only the origin root. Before first startup, set `users.initialAdmin.username`, `users.initialAdmin.email` and `users.initialAdmin.password` in the runtime configuration. The default template uses `nocobase` / `admin@nocobase.com` / `admin123`. These settings apply only when the default seed runs against an empty user table and do not reset existing accounts. Replace the default password before opening access. Verify platform permissions and deploy a test App to check routing and persistence.

## Upgrade and recovery

Back up the platform database, stable secrets, Releases, desired configurations and application volumes. Update the image or built code while retaining persistence. A Hub restart affects its Host and applications. Verify each App after recovery; Hub readiness is not equivalent to every eager App being ready. Interrupted queued or deploying operations are marked failed and require inspection before retrying. See [Backup, recovery and troubleshooting](./operations).

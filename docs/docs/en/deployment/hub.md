---
title: Deploy Hub
description: Run the Hub control plane and its managed App Host.
---

# Deploy Hub

Hub manages Releases, deployments, configuration and runtime operations. The current implementation starts one local managed App Host with in-process applications. It does not provide remote Host scheduling or per-App container isolation. If Hub is already available, continue with [Publish applications with Hub](./hub-publishing).

## Platform deployment

The repository provides `Dockerfile.hub` and an image publishing workflow for `ghcr.io/nocobase/hub` and `registry.cn-beijing.aliyuncs.com/nocobase/hub`, targeting amd64 and arm64. Verify an available tag or digest before use; workflow configuration alone does not prove a tag was published. Alternatively, scaffold the Hub template and build for the target platform with Node 24.

Configure a persistent storage directory, database and stable authentication/session secrets before starting. Set `APP_CONFIG_FILE` to the runtime configuration file and `HUB_STORAGE_DIR` to a writable persistent directory. With Docker, mount both explicitly and set SQLite's filename to a path inside the persistent mount. The image contains `/app/config.example.yml` as a configuration reference. Do not replace an existing runtime configuration with the template on upgrade.

## Public access

Use `APP_BASE_PATH=/hub`, set `APP_PUBLIC_ORIGIN` to the external origin without a path, and proxy the public site to Hub's application port. The standalone listener keeps `/hub` and its descendants in Hub and forwards other paths, including WebSocket upgrades, to its ready Host. Preserve Host and protocol information. Hosted applications can use paths such as `/crm`; the Host port does not need separate public exposure.

Visit `/hub/`, not only the origin root. With the default authentication seed enabled and an empty user table, the initial account is `admin@nocobase.com` with password `admin123`. Change the password before opening access. Verify platform permissions and deploy a test App to check routing and persistence.

## Upgrade and recovery

Back up the platform database, stable secrets, Releases, desired configurations and application volumes. Update the image or built code while retaining persistence. A Hub restart affects its Host and applications. Verify each App after recovery; Hub readiness is not equivalent to every eager App being ready. Interrupted queued or deploying operations are marked failed and require inspection before retrying. See [Backup, recovery and troubleshooting](./operations).

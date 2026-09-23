---
title: Publish applications with Hub
description: Upload a Release and deploy it through the console or CLI.
---

# Publish applications with Hub

This page assumes an operational Hub and permission to manage the target App. See [Deploy Hub](./hub) for platform setup.

## Build and upload

Create an App in Hub and record its ID and public path. Build in the application project for the Host platform; for Linux x64 with glibc and Node 24:

```bash
APP_BASE_PATH=/crm pnpm build --target linux-x64 --node-version 24 --tar
```

The current artifact is `storage/exports/dist.tar.gz`. Upload it from the App detail page, select the Release, prepare runtime configuration, review, and deploy. Uploading alone does not deploy.

## Publish through the CLI

`HUB_API_KEY` is created in Hub, not in the application. Open **API Keys** in the Hub navigation (`<HUB_URL>/api-keys`, which requires `hub.app / manage-api-keys`, granted to `hub-administrator` and `hub-operator` by default) and choose **Create API Key**: select the target application under **Applications**, or **All applications (including future apps)**, then grant **Upload release** for uploads and both **Upload release** and **Deploy release** for anything that deploys. The plaintext key is shown once at creation and can be copied again by its creator while the key is active. Bound applications and permissions cannot be changed afterwards, so a key with the wrong scope is deleted and recreated. A key never exceeds its creator's current permissions.

Provide `HUB_URL` (including its mount path), `HUB_APP_ID`, and `HUB_API_KEY` through a protected environment or the project's gitignored `.env`. Flags override process environment, which overrides `.env`; publishing does not load `.env.local`.

```bash
pnpm nocobase app upload --deploy --config ./runtime.yml --wait --json
```

For an existing uploaded Release, use `pnpm nocobase app deploy --release-id <releaseId> --wait --json`. Without `--config`, an existing deployment reuses current configuration; first deployment uses Release-template initialization. A supplied UTF-8 YAML document replaces configuration, subject to existing secret handling and validation, rather than merging arbitrary fields. The limit is 1 MiB; upload without `--deploy` rejects `--config`.

Keep the same idempotency key and payload for network retries. Use a new deployment key only when intentionally requesting another deployment. Acceptance is not completion: check the exit code and `result.operationStatus`, particularly with `--no-wait`.

## Update and roll back

Back up data before deploying migrations. Runtime replacement is stop-first and does not guarantee zero downtime. Rollback creates a new deployment from a successful historical deployment; it does not undo database changes or restore a complete historical configuration snapshot. Stop preserves deployment and data, while removing an App deletes its managed records and volume. See [Backup, recovery and troubleshooting](./operations).

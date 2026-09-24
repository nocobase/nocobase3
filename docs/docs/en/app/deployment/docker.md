---
title: 'Standalone: Docker'
description: Build the application into an image and run it with persistent storage, without Hub.
---

# Standalone: Docker

To run Hub itself in a container, read [Deploy Hub](./hub). This page builds an image from an application's build output; database and persistent directory settings are in [Production configuration](./configuration).

## 1. Build the image

First [build the deployment archive](./standalone#build-the-deployment-archive), then extract it into a separate image build directory that holds only `dist`, `config.example.yml` and the Dockerfile below. Never put the real configuration or a database into the image build context.

```dockerfile
FROM node:24.15.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node dist/ /app/dist/
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
CMD ["node", "/app/dist/server/standalone.js"]
```

On an x64 build machine targeting Linux x64, run `docker build --platform linux/amd64 -t crm:release-001 .`. Building for another architecture needs a working Buildx or emulation setup, and the application archive must be built for the same architecture as the image. The image does not reinstall the dependencies in `dist`; they arrive with the archive.

## 2. Prepare the runtime configuration

Create a dedicated directory on the server holding `compose.yml`, the target environment's `config.yml` and `storage/`. Configure the secrets as described in [authentication and session secrets](./configuration#configure-authentication-and-session-secrets), but point the SQLite path at `/app/storage/database.sqlite` inside the container. Make sure the runtime user can write to `storage`; the `node` user in the official Node image is usually UID/GID 1000, but go by the `id` output of the image you chose.

## 3. Write the Compose file

Create `compose.yml` in the deployment directory:

```yaml
services:
  crm:
    image: crm:release-001
    restart: unless-stopped
    init: true
    stop_grace_period: 60s
    ports:
      - '127.0.0.1:13000:13000'
    environment:
      NODE_ENV: production
      APP_CONFIG_FILE: /app/config.yml
      APP_BASE_PATH: /crm
      APP_PUBLIC_ORIGIN: https://apps.example.com
      APP_SERVER_HOST: 0.0.0.0
      APP_SERVER_PORT: '13000'
      NOCOBASE_STRICT_STARTUP: 'true'
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:13000/crm/api/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))",
        ]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    volumes:
      - ./config.yml:/app/config.yml:ro
      - ./storage:/app/storage
```

`NOCOBASE_STRICT_STARTUP` makes a container that fails to start exit, so `restart: unless-stopped` retries it. The `healthcheck` calls the application's `/crm/api/healthz` endpoint; the image has no curl, so Node makes the request.

## 4. Start the service

Before starting, confirm `config.yml` exists and is a file, or Docker creates a directory at the missing bind path. In the deployment directory run:

```bash
docker compose config --quiet
docker compose up -d
docker compose ps
docker compose logs --tail=100 crm
```

If the image was built on another machine, move it to the server through your own registry or with save/load. Inside the container, the database host cannot be the host machine's idea of `localhost`.

## Public access and acceptance

Configure the public address as described in [HTTPS and reverse proxy](./configuration#https-and-reverse-proxy), then follow [Initialize and verify](./standalone#initialize-and-verify) to change the administrator password, verify real business operations and confirm data survives a restart.

## Update and recovery

Use a new image tag or digest and keep the existing configuration and `storage` mounts. Back up and check migration compatibility before releasing, update `image`, run `docker compose up -d`, and verify real business operations again. See [Update and roll back](./standalone#update-and-roll-back) and [Backup and recovery](./operations#backup-and-recovery).

---
title: 'Build and run'
description: 'What the build output looks like, and how to start it on a server.'
---

# Build and run

:::warning Being written
This page is being written.
:::

What the build output looks like, and how to start it on a server.

## This page will cover

- What `pnpm build` produces
- What the server needs installed
- The start command
- Keeping the process alive

## Keep the process alive with pm2

When systemd is not an option, [pm2](https://pm2.keymetrics.io/) can supervise the process. The application project ships an `ecosystem.config.js` that starts `./dist/server/standalone.js` with `node` and sets `NODE_ENV=production`. The file is not part of the deployment archive: copy it from the project into the deployment root, beside `dist`. Pass the remaining runtime settings as environment variables or add them to the file's `env` block, then run the following from the deployment root:

```bash
APP_CONFIG_FILE=/srv/nocobase/crm/config.yml \
APP_BASE_PATH=/crm \
APP_PUBLIC_ORIGIN=https://apps.example.com \
APP_SERVER_HOST=127.0.0.1 \
APP_SERVER_PORT=13000 \
pm2 start ecosystem.config.js
pm2 save
```

The process name is the `name` field in the file, `nocobase-app-template-default` by default; rename it per application. Use `pm2 restart <name>` to restart, `pm2 logs <name>` to read logs, and `pm2 startup` to print the command that starts pm2 at boot.

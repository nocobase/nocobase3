#!/usr/bin/env node

import process from "node:process";

import { startAppHostFromEnv, type AppHost } from "./index.ts";

let appHost: AppHost | null = null;
let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log("\nShutting down App host...");
  if (appHost) {
    await appHost.close("host shutdown");
  }
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

startAppHostFromEnv()
  .then((host) => {
    appHost = host;
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

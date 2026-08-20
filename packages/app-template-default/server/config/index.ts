import app from './app.js';
import cache from './cache.js';
import database from './database.js';
import drive from './drive.js';
import logger from './logger.js';
import queue from './queue.js';
import session from './session.js';
import server from './server.js';
import spa from './spa.js';
import workflow from './workflow.js';
import type { AppConfig } from './types.js';

const config: {
  app: typeof app;
  cache: typeof cache;
  database: typeof database;
  drive: typeof drive;
  logger: typeof logger;
  queue: typeof queue;
  session: typeof session;
  workflow: typeof workflow;
  server: typeof server;
  spa: typeof spa;
} = {
  app: app,
  cache: cache,
  database: database,
  drive: drive,
  logger: logger,
  queue: queue,
  session: session,
  workflow: workflow,
  server: server,
  spa: spa,
};

export type { AppConfig };

export default config;

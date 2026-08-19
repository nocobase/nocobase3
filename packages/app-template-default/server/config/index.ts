import app from './app.js';
import cache from './cache.js';
import database from './database.js';
import drive from './drive.js';
import logging from './logging.js';
import queue from './queue.js';
import session from './session.js';
import server from './server.js';
import spa from './spa.js';
import type { AppConfig } from './types.js';

const config: {
  app: typeof app;
  cache: typeof cache;
  database: typeof database;
  drive: typeof drive;
  logging: typeof logging;
  queue: typeof queue;
  session: typeof session;
  server: typeof server;
  spa: typeof spa;
} = {
  app: app,
  cache: cache,
  database: database,
  drive: drive,
  logging: logging,
  queue: queue,
  session: session,
  server: server,
  spa: spa,
};

export type { AppConfig };

export default config;

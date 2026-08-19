import app from './app.js';
import caching from './caching.js';
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
  caching: typeof caching;
  database: typeof database;
  drive: typeof drive;
  logging: typeof logging;
  queue: typeof queue;
  session: typeof session;
  server: typeof server;
  spa: typeof spa;
} = {
  app: app,
  caching: caching,
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

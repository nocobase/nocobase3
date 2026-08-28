import app from './app.js';
import auth from './auth.js';
import caching from './caching.js';
import database from './database.js';
import drive from './drive.js';
import logging from './logging.js';
import notification from './notification.js';
import queue from './queue.js';
import session from './session.js';
import server from './server.js';
import spa from './spa.js';
import workflow from './workflow.js';
import type { AppConfig } from './types.js';

const config: {
  app: typeof app;
  auth: typeof auth;
  caching: typeof caching;
  database: typeof database;
  drive: typeof drive;
  logging: typeof logging;
  notification: typeof notification;
  queue: typeof queue;
  session: typeof session;
  workflow: typeof workflow;
  server: typeof server;
  spa: typeof spa;
} = {
  app: app,
  auth: auth,
  caching: caching,
  database: database,
  drive: drive,
  logging: logging,
  notification: notification,
  queue: queue,
  session: session,
  workflow: workflow,
  server: server,
  spa: spa,
};

export type { AppConfig };

export default config;

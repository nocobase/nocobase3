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
import snowflake from './snowflake.js';
import spa from './spa.js';
import workflow from './workflow.js';
import type { AppConfig } from './types.js';
import type { AppRuntimeConfigFactories } from '@nocobase/app-server-kit/runtime';
import type { DefaultAppScopeConfig } from './types.js';

const config: AppRuntimeConfigFactories<AppConfig, DefaultAppScopeConfig> = {
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
  snowflake: snowflake,
  spa: spa,
};

export type { AppConfig };

export default config;

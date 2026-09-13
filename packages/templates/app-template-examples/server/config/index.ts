import {
  defaultAppConfigs,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import auth from './auth.js';
import notification from './notification.js';
import session from './session.js';
import server from './server.js';
import spa from './spa.js';
import heartbeat from './heartbeat.js';
import logging from './logging.js';
import drive from './drive.js';
import queue from './queue.js';
import caching from './caching.js';
import i18n from './i18n.js';
import app from './app.js';
import database from './database.js';
import snowflake from './snowflake.js';
import ai from './ai.js';
import workflow from './workflow.js';

const defaultConfigs: AppConfigFactory<{
  auth: ReturnType<typeof auth>;
  notification: ReturnType<typeof notification>;
  session: ReturnType<typeof session>;
  server: ReturnType<typeof server>;
  spa: ReturnType<typeof spa>;
  heartbeat: ReturnType<typeof heartbeat>;
  logging: ReturnType<typeof logging>;
  drive: ReturnType<typeof drive>;
  queue: ReturnType<typeof queue>;
  caching: ReturnType<typeof caching>;
  i18n: ReturnType<typeof i18n>;
  app: ReturnType<typeof app>;
  database: ReturnType<typeof database>;
  snowflake: ReturnType<typeof snowflake>;
  ai: ReturnType<typeof ai>;
  workflow: ReturnType<typeof workflow>;
}> = defaultAppConfigs({
  auth,
  notification,
  session,
  server,
  spa,
  heartbeat,
  logging,
  drive,
  queue,
  caching,
  i18n,
  app,
  database,
  snowflake,
  ai,
  workflow,
});

export default defaultConfigs;

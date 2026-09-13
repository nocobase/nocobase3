import heartbeat from './heartbeat.js';
import {
  defaultAppConfigs,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import auth from './auth.js';
import notification from './notification.js';
import session from './session.js';
import server from './server.js';
import spa from './spa.js';
import logging from './logging.js';
import drive from './drive.js';
import queue from './queue.js';
import caching from './caching.js';
import i18n from './i18n.js';
import app from './app.js';
import database from './database.js';
import snowflake from './snowflake.js';
import hub from './hub.js';
import workflow from './workflow.js';

const defaultConfigs: AppConfigFactory<{
  heartbeat: ReturnType<typeof heartbeat>;
  auth: ReturnType<typeof auth>;
  notification: ReturnType<typeof notification>;
  session: ReturnType<typeof session>;
  server: ReturnType<typeof server>;
  spa: ReturnType<typeof spa>;
  logging: ReturnType<typeof logging>;
  drive: ReturnType<typeof drive>;
  queue: ReturnType<typeof queue>;
  caching: ReturnType<typeof caching>;
  i18n: ReturnType<typeof i18n>;
  app: ReturnType<typeof app>;
  database: ReturnType<typeof database>;
  snowflake: ReturnType<typeof snowflake>;
  hub: ReturnType<typeof hub>;
  workflow: ReturnType<typeof workflow>;
}> = defaultAppConfigs({
  heartbeat,
  auth,
  notification,
  session,
  server,
  spa,
  logging,
  drive,
  queue,
  caching,
  i18n,
  app,
  database,
  snowflake,
  hub,
  workflow,
});

export default defaultConfigs;

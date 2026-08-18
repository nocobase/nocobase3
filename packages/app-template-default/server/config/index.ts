import app from './app.js';
import database from './database.js';
import server from './server.js';
import spa from './spa.js';
import type { AppConfig } from './types.js';

const config: {
  app: typeof app;
  database: typeof database;
  server: typeof server;
  spa: typeof spa;
} = {
  app: app,
  database: database,
  server: server,
  spa: spa,
};

export type { AppConfig };

export default config;

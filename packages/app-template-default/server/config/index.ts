import app from './app.js';
import database from './database.js';
import server from './server.js';
import spa from './spa.js';

const config = {
  app,
  database,
  server,
  spa,
};

export type AppConfig = {
  app: ReturnType<typeof app>;
  database: ReturnType<typeof database>;
  server: ReturnType<typeof server>;
  spa: ReturnType<typeof spa>;
};

export default config;

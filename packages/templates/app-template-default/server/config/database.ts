import sqlite from '@nocobase/db-sqlite';
import { defineAppDatabaseConfig } from '@nocobase/app-server/database';

/**
 * The dialect packages this application installs. Drivers are code rather
 * than settings, so they are declared here and cannot be overridden from
 * config.yml; a connection may only use a dialect listed here.
 */
export default defineAppDatabaseConfig(({ paths }) => ({
  drivers: { sqlite },
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: paths.storage('database.sqlite'),
      schemaManagement: 'managed',
      debug: false,
    },
  },
}));

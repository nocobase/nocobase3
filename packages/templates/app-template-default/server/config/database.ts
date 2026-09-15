import sqlite from '@nocobase/db-sqlite';
import type { AppConfigFactory } from '@nocobase/app-server/config';
import {
  defineDatabaseConfig,
  type AppDatabaseConfig,
} from '@nocobase/app-server/database';

/**
 * The dialect packages this application installs. Drivers are code rather than
 * settings, so they are declared here and cannot be overridden from config.yml.
 * A connection may only use a dialect listed here, and using one that is not is
 * a type error rather than a failure to start.
 */
const database: AppConfigFactory<AppDatabaseConfig> = defineDatabaseConfig({
  sqlite,
})((runtime) => ({
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: runtime.configPaths.storage('database.sqlite'),
      schemaManagement: 'managed',
      debug: false,
    },
  },
}));

export default database;

import sqlite from '@nocobase/db-sqlite';
import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppDatabaseConfig } from '@nocobase/app-server/database';

const database: AppConfigFactory<AppDatabaseConfig> = defineAppConfig(
  (runtime) => ({
    /**
     * The dialect packages this application installs. Drivers are code rather
     * than settings, so they are declared here and cannot be overridden from
     * config.yml; a connection may only use a dialect listed here.
     */
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: runtime.configPaths.storage('database.sqlite'),
        schemaManagement: 'managed',
        debug: false,
      },
    },
  }),
);

export default database;

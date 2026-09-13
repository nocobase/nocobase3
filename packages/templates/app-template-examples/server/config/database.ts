import sqlite from '@nocobase/db-sqlite';
import postgres from '@nocobase/db-postgres';
import mysql from '@nocobase/db-mysql';
import oracle from '@nocobase/db-oracle';
import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppDatabaseConfig } from '@nocobase/app-server/database';
import { createAppPluginDatabaseConfig } from '@nocobase/app-server/plugins';

const database: AppConfigFactory<AppDatabaseConfig> = defineAppConfig(
  (runtime) => {
    const database: AppDatabaseConfig = {
      /**
       * The dialect packages this application installs. Drivers are code rather
       * than settings, so they are declared here and cannot be overridden from
       * config.yml; a connection may only use a dialect listed here.
       */
      drivers: { sqlite, postgres, mysql, oracle },
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: runtime.configPaths.storage('database.sqlite'),
          schemaManagement: 'managed',
          debug: false,
        },
        analytics: {
          dialect: 'sqlite',
          filename: runtime.configPaths.storage('analytics.sqlite'),
          schemaManagement: 'managed',
          migrations: { autoRun: true },
          seeds: { autoRun: true },
        },
      },
      taskSources: {
        directory: runtime.configPaths.database(),
        packageName: runtime.plugins.appPackageName,
        migrations: [],
        seeds: [],
      },
    };
    return createAppPluginDatabaseConfig(database, runtime.plugins).database;
  },
);

export default database;

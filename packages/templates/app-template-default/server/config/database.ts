import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppDatabaseConfig } from '@nocobase/app-server/database';
import { createAppPluginDatabaseConfig } from '@nocobase/app-server/plugins';

const database: AppConfigFactory<AppDatabaseConfig> = defineAppConfig(
  (runtime) => {
    const database: AppDatabaseConfig = {
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: runtime.configPaths.storage('database.sqlite'),
          schemaManagement: 'managed',
          debug: false,
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

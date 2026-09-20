import { defineAppDatabaseConfig } from '@nocobase/app-server/database';

/** Installed official drivers are loaded synchronously when first needed. */
export default defineAppDatabaseConfig(({ paths }) => ({
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: paths.storage('hub/database/main.sqlite'),
      schemaManagement: 'managed',
      debug: false,
    },
  },
}));

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file-repository/server';
const plugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-file-repository-example',
  database: { migrations: './database/migrations' },
  routes: defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: 'attachments',
        collection: 'attachments',
        connection: 'main',
        disk: 'local',
        accessPath: '/uploads/attachments',
        accessMode: 'stream',
        actions: {
          findMany: {},
          findOne: {},
          count: {},
          exists: {},
          deleteOne: {},
          uploadOne: {},
          uploadMany: {},
        },
      },
    ],
  }),
});
export default plugin;

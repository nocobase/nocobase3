import {
  defineRepositoryApiRoutes,
  type RepositoryApiExposure,
} from '@nocobase/app-server/router';
import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';
import {
  defineFileRepositoryApiRoutes,
  type FileRepositoryApiActions,
} from '@nocobase/app-plugin-file/server';

const fileActions: FileRepositoryApiActions = {
  findMany: {},
  findOne: {},
  count: {},
  exists: {},
  deleteOne: {},
  uploadOne: {},
  uploadMany: {},
};

// Three file collections share the same File Repository implementation: the
// flat attachments demo, one profile avatar (one-to-one) and many order
// attachments (one-to-many).
const fileRoutes = defineFileRepositoryApiRoutes({
  repositories: [
    {
      name: 'attachments',
      collection: 'attachments',
      connection: 'main',
      disk: 'local',
      accessPath: '/uploads/attachments',
      accessMode: 'stream',
      actions: fileActions,
    },
    {
      name: 'profileAvatars',
      collection: 'fileExampleProfileAvatars',
      connection: 'main',
      disk: 'local',
      accessPath: '/uploads/profile-avatars',
      accessMode: 'stream',
      actions: fileActions,
    },
    {
      name: 'orderAttachments',
      collection: 'fileExampleOrderAttachments',
      connection: 'main',
      disk: 'local',
      accessPath: '/uploads/order-attachments',
      accessMode: 'stream',
      actions: fileActions,
    },
  ],
});

// Business repositories own the relations. Clients upload through the file
// repositories and then connect the returned record here.
const businessRepositories: readonly RepositoryApiExposure[] = [
  {
    name: 'fileExampleProfiles',
    actions: {
      findMany: { maxLimit: 100 },
      findOne: {},
      updateOne: {
        writePolicy: (w) =>
          w
            .fields('name', 'jobTitle')
            .relation('avatar', (r) => r.connect().disconnect()),
      },
    },
  },
  {
    name: 'fileExampleOrders',
    actions: {
      findMany: { maxLimit: 100 },
      findOne: {},
      updateOne: {
        writePolicy: (w) =>
          w
            .fields('number', 'customerName', 'status', 'amountCents')
            .relation('attachments', (r) => r.connect().disconnect()),
      },
    },
  },
];

const plugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-file-example',
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
  routes: [
    ...fileRoutes,
    defineRepositoryApiRoutes({ repositories: businessRepositories }),
  ],
});
export default plugin;

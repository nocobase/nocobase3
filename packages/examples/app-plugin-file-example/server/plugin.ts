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
import { buildRepositoryPolicy, type RepositoryPolicy } from '@nocobase/db';

const fileActions: FileRepositoryApiActions = {
  findMany: {},
  findOne: {},
  count: {},
  exists: {},
  deleteOne: {},
  uploadOne: {},
  uploadMany: {},
};

/**
 * Uploading and removing metadata, but no caller-supplied file record.
 *
 * `create` is a node rather than `false` because an upload is a create: the
 * empty allowlist refuses a client-written row while the upload path, which
 * supplies no caller fields at all, still works.
 */
const filePolicy: RepositoryPolicy = {
  read: true,
  create: { scope: true },
  update: false,
  delete: true,
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
      policy: filePolicy,
      actions: fileActions,
    },
    {
      name: 'profileAvatars',
      collection: 'fileExampleProfileAvatars',
      connection: 'main',
      disk: 'local',
      accessPath: '/uploads/profile-avatars',
      accessMode: 'stream',
      policy: filePolicy,
      actions: fileActions,
    },
    {
      name: 'orderAttachments',
      collection: 'fileExampleOrderAttachments',
      connection: 'main',
      disk: 'local',
      accessPath: '/uploads/order-attachments',
      accessMode: 'stream',
      policy: filePolicy,
      actions: fileActions,
    },
  ],
});

// Business repositories own the relations. Clients upload through the file
// repositories and then connect the returned record here.
const businessRepositories: readonly RepositoryApiExposure[] = [
  {
    name: 'fileExampleProfiles',
    policy: buildRepositoryPolicy((policy) =>
      policy.read(true).update((update) =>
        update
          .scope(true)
          .fields('name', 'jobTitle')
          .relation('avatar', (avatar) => avatar.connect().disconnect()),
      ),
    ),
    actions: {
      findMany: { maxLimit: 100 },
      findOne: {},
      updateOne: {},
    },
  },
  {
    name: 'fileExampleOrders',
    policy: buildRepositoryPolicy((policy) =>
      policy.read(true).update((update) =>
        update
          .scope(true)
          .fields('number', 'customerName', 'status', 'amountCents')
          .relation('attachments', (attachments) =>
            attachments.connect().disconnect(),
          ),
      ),
    ),
    actions: {
      findMany: { maxLimit: 100 },
      findOne: {},
      updateOne: {},
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

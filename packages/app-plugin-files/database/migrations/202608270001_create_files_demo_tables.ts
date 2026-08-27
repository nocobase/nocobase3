import {
  defineMigration,
  type CollectionDefinitionBuilder,
  type MigrationDefinition,
} from '@nocobase/app-database';

// Published database sources cannot import the package's uncompiled server sources.
const COLLECTIONS = Object.freeze({
  profiles: 'filesDemoProfiles',
  profileAvatars: 'filesDemoProfileAvatars',
  orders: 'filesDemoOrders',
  orderAttachments: 'filesDemoOrderAttachments',
});

const migration: MigrationDefinition = defineMigration({
  name: '202608270001_create_files_demo_tables',

  async up({ builder }) {
    await builder.createCollection(COLLECTIONS.profiles, (collection) => {
      collection.increments('id').unsigned();
      collection.string('name', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection
        .hasOne('avatar', COLLECTIONS.profileAvatars)
        .foreignKey('profileId');
    });

    await builder.createCollection(COLLECTIONS.profileAvatars, (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.integer('profileId').unsigned().notNull();
      addStandardFileFields(collection);
      collection.primary('id', { name: 'pk_files_demo_profile_avatars' });
      collection.unique('profileId', {
        name: 'uq_files_demo_profile_avatars_profile',
      });
      collection.unique(['disk', 'key'], {
        name: 'uq_files_demo_profile_avatars_disk_key',
      });
      collection
        .belongsTo('profile', COLLECTIONS.profiles, {
          index: false,
        })
        .foreignKey('profileId')
        .targetKey('id')
        .constraints(true)
        .onDelete('cascade');
    });

    await builder.createCollection(COLLECTIONS.orders, (collection) => {
      collection.increments('id').unsigned();
      collection.string('number', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('number', { name: 'uq_files_demo_orders_number' });
      collection
        .hasMany('attachments', COLLECTIONS.orderAttachments)
        .foreignKey('orderId');
    });

    await builder.createCollection(
      COLLECTIONS.orderAttachments,
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.integer('orderId').unsigned().notNull();
        addStandardFileFields(collection);
        collection.primary('id', {
          name: 'pk_files_demo_order_attachments',
        });
        collection.unique(['disk', 'key'], {
          name: 'uq_files_demo_order_attachments_disk_key',
        });
        collection.index('orderId', {
          name: 'idx_files_demo_order_attachments_order',
        });
        collection
          .belongsTo('order', COLLECTIONS.orders, { index: false })
          .foreignKey('orderId')
          .targetKey('id')
          .constraints(true)
          .onDelete('cascade');
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection(COLLECTIONS.orderAttachments);
    await builder.dropCollection(COLLECTIONS.orders);
    await builder.dropCollection(COLLECTIONS.profileAvatars);
    await builder.dropCollection(COLLECTIONS.profiles);
  },
});

function addStandardFileFields(collection: CollectionDefinitionBuilder): void {
  collection.string('disk', { length: 64 }).notNull();
  collection.string('key', { length: 512 }).notNull();
  collection.string('filename', { length: 255 }).notNull();
  collection.string('mimeType', { length: 255 }).notNull();
  collection.bigInt('size').unsigned().notNull();
  collection.boolean('public').notNull().defaultTo(false);
  collection.datetime('createdAt').notNull();
  collection.datetime('updatedAt').notNull();
}

export default migration;

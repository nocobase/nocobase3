import {
  defineMigration,
  type CollectionDefinitionBuilder,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * Business tables for the relationship examples. The two file collections keep
 * the standard file columns and add a nullable foreign key, because uploads
 * create metadata before the business record links to it.
 */
const collections = Object.freeze({
  profiles: 'fileExampleProfiles',
  profileAvatars: 'fileExampleProfileAvatars',
  orders: 'fileExampleOrders',
  orderAttachments: 'fileExampleOrderAttachments',
});

function addFileFields(collection: CollectionDefinitionBuilder): void {
  collection.string('id', { length: 64 }).primary().notNull();
  collection.string('disk', { length: 255 }).notNull();
  collection.text('key').notNull();
  collection.text('filename').notNull();
  collection.string('ext', { length: 32 }).notNull();
  collection.string('mimeType', { length: 255 }).notNull();
  collection.bigInt('size').notNull();
  collection.datetime('createdAt').notNull();
  collection.datetime('updatedAt').notNull();
}

const migration: MigrationDefinition = defineMigration({
  name: '202609110001_create_file_example_business',
  async up({ builder }) {
    await builder.createCollections([
      {
        name: collections.profiles,
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('name', { length: 120 }).notNull();
          collection.string('jobTitle', { length: 120 }).notNull();
          collection.datetime('createdAt').notNull();
          collection.datetime('updatedAt').notNull();
          collection
            .hasOne('avatar', collections.profileAvatars)
            .sourceKey('id')
            .foreignKey('profileId')
            .constraints(false);
        },
      },
      {
        name: collections.orders,
        definition: (collection) => {
          collection.string('id', { length: 64 }).primary().notNull();
          collection.string('number', { length: 64 }).notNull();
          collection.string('customerName', { length: 160 }).notNull();
          collection
            .enum('status', { values: ['draft', 'submitted', 'archived'] })
            .notNull()
            .defaultTo('draft');
          collection.integer('amountCents').notNull().defaultTo(0);
          collection.datetime('createdAt').notNull();
          collection.datetime('updatedAt').notNull();
          collection.unique(['number']);
          collection
            .hasMany('attachments', collections.orderAttachments)
            .sourceKey('id')
            .foreignKey('orderId')
            .constraints(false);
        },
      },
      {
        name: collections.profileAvatars,
        definition: (collection) => {
          addFileFields(collection);
          collection.string('profileId', { length: 64 }).nullable();
          // One profile owns at most one avatar; unused rows keep a null owner.
          collection.unique(['profileId']);
          collection
            .belongsTo('profile', collections.profiles, { index: false })
            .targetKey('id')
            .foreignKey('profileId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
      {
        name: collections.orderAttachments,
        definition: (collection) => {
          addFileFields(collection);
          collection.string('orderId', { length: 64 }).nullable();
          collection.index('orderId');
          collection
            .belongsTo('order', collections.orders, { index: false })
            .targetKey('id')
            .foreignKey('orderId')
            .constraints(true)
            .onDelete('cascade');
        },
      },
    ]);
  },
  async down({ builder }) {
    await builder.dropCollection(collections.orderAttachments);
    await builder.dropCollection(collections.profileAvatars);
    await builder.dropCollection(collections.orders);
    await builder.dropCollection(collections.profiles);
  },
});

export default migration;

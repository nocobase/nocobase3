import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609140001_add_local_mail_labels',
  async up({ builder }) {
    await builder.createCollection('mailLabels', (collection) => {
      collection.uuid('id').primary();
      collection.string('ownerId', { length: 255, nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });
      collection.unique(['ownerId', 'name'], {
        name: 'mail_labels_owner_name_unique',
      });
    });

    await builder.createCollection('mailMessageLabels', (collection) => {
      collection.uuid('messageId', { nullable: false });
      collection.uuid('labelId', { nullable: false });
      collection.primary(['messageId', 'labelId'], {
        name: 'mail_message_labels_pk',
      });
      collection.index(['labelId', 'messageId'], {
        name: 'mail_message_labels_label_idx',
      });
      collection
        .belongsTo('message', 'mailMessages')
        .targetKey('id')
        .foreignKey('messageId')
        .constraints(true)
        .onDelete('cascade');
      collection
        .belongsTo('label', 'mailLabels')
        .targetKey('id')
        .foreignKey('labelId')
        .constraints(true)
        .onDelete('cascade');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('mailMessageLabels');
    await builder.dropCollection('mailLabels');
  },
});

export default migration;

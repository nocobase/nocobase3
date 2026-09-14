import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609140002_add_mail_label_color',

  async up({ builder }) {
    await builder.alterCollection('mailLabels', (collection) => {
      collection.string('color', {
        length: 30,
        nullable: false,
        defaultValue: 'blue',
      });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('mailLabels', (collection) => {
      collection.dropField('color');
    });
  },
});

export default migration;

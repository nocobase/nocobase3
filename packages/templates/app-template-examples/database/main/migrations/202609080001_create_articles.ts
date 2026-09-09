import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609080001_create_articles',

  async up({ builder }) {
    await builder.createCollection('articles', (collection) => {
      collection.title('文章');
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.text('summary', { nullable: true });
      collection.text('content', { nullable: false, defaultValue: '' });
      collection.enum('status', {
        values: ['draft', 'published', 'archived'],
        nullable: false,
        defaultValue: 'draft',
      });
      collection.datetime('publishedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['status', 'publishedAt']);
      collection.index('createdAt');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('articles');
  },
});

export default migration;

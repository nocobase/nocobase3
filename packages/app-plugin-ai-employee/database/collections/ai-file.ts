import type { BuilderResult, CollectionBuilder } from '@nocobase/app-database';

export function createAIFileCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'aiFiles',
    (c) => {
      c.string('id').notNull();
      c.string('title').nullable();
      c.string('filename').nullable();
      c.string('extname').nullable();
      c.integer('size').nullable();
      c.string('mimetype').nullable();
      c.text('path').nullable();
      c.text('url').nullable();
      c.text('preview').nullable();
      c.string('storageId').nullable();
      c.json('meta', { defaultValue: {} }).notNull();
      c.string('createdById').nullable();
      c.string('updatedById').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('id', { name: 'pk_ai_files' });
    },
    { ifNotExists: true, syncMetadata: false },
  );
}

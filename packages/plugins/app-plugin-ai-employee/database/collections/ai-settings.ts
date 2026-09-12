import type { BuilderResult, CollectionBuilder } from '@nocobase/db';

export function createAISettingsCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'aiSettings',
    (c) => {
      c.json('options', { defaultValue: { storage: 'local' } }).notNull();
      c.string('defaultLLMService').nullable();
      c.string('defaultModel').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
    },
    { ifNotExists: true, syncMetadata: false },
  );
}

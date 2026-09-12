import type { BuilderResult, CollectionBuilder } from '@nocobase/db';

export function createLLMServiceCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'llmServices',
    (c) => {
      c.string('name').notNull();
      c.string('title').nullable();
      c.string('provider').nullable();
      c.json('options').nullable();
      c.json('enabledModels', {
        defaultValue: { mode: 'recommended', models: [] },
      }).notNull();
      c.boolean('enabled', { defaultValue: true }).notNull();
      c.json('modelOptions', {
        defaultValue: {
          temperature: 1,
          topP: 1,
          frequencyPenalty: 0,
          presencePenalty: 0,
        },
      }).notNull();
      c.integer('sort').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('name', { name: 'pk_llm_services' });
    },
    { ifNotExists: true, syncMetadata: false },
  );
}

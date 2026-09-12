import type { BuilderResult, CollectionBuilder } from '@nocobase/db';

export function createAIEmployeeCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'aiEmployees',
    (c) => {
      c.string('username').notNull();
      c.string('nickname').nullable();
      c.string('position').nullable();
      c.string('avatar').nullable().defaultTo('nocobase-015-male');
      c.text('bio').nullable();
      c.text('about').nullable();
      c.text('description').nullable();
      c.text('defaultPrompt').nullable();
      c.text('greeting').nullable();
      c.json('chatSettings').nullable();
      c.json('skillSettings').nullable();
      c.json('modelSettings').nullable();
      c.json('dataSourceSettings').nullable();
      c.boolean('enableKnowledgeBase', { defaultValue: false }).notNull();
      c.text('knowledgeBasePrompt').nullable();
      c.json('knowledgeBase').nullable();
      c.boolean('enabled', { defaultValue: true }).notNull();
      c.boolean('builtIn', { defaultValue: false }).notNull();
      c.string('category', { defaultValue: 'business' }).notNull();
      c.boolean('deprecated', { defaultValue: false }).notNull();
      c.integer('sort').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('username', { name: 'pk_ai_employees' });
    },
    { ifNotExists: true, syncMetadata: false },
  );
}

import type { BuilderResult, CollectionBuilder } from '@nocobase/app-database';

export function createAIConversationCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'aiConversations',
    (c) => {
      c.uuid('sessionId').notNull();
      c.integer('thread', { defaultValue: 0 }).notNull();
      c.string('topicId').nullable();
      c.string('from', { defaultValue: 'main-agent' }).notNull();
      c.string('scope').nullable().index();
      c.string('userId').nullable();
      c.string('aiEmployeeUsername').nullable();
      c.string('title').nullable();
      c.json('options').nullable();
      c.string('llmActiveState', { defaultValue: 'idle' }).nullable();
      c.string('category', { defaultValue: 'chat' }).nullable();
      c.boolean('read', { defaultValue: true }).notNull();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('sessionId', { name: 'pk_ai_conversations' });
      c.foreignKey('userId', {
        references: { collection: 'user', fields: ['id'] },
      });
      c.foreignKey('aiEmployeeUsername', {
        references: { collection: 'aiEmployees', fields: ['username'] },
        onDelete: 'cascade',
      });
    },
    { ifNotExists: true, syncMetadata: false },
  );
}

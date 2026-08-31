import type { BuilderResult, CollectionBuilder } from '@nocobase/app-database';

export function createAIMessageCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'aiMessages',
    (c) => {
      c.bigInt('messageId').notNull();
      c.string('sessionId').nullable();
      c.string('role').nullable();
      c.json('content').nullable();
      c.json('toolCalls').nullable();
      c.json('attachments').nullable();
      c.json('workContext').nullable();
      c.json('metadata').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('messageId', { name: 'pk_ai_messages' });
      c.index('sessionId', { name: 'idx_ai_messages_session' });
    },
    { ifNotExists: true, syncMetadata: false },
  );
}

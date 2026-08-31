import type { BuilderResult, CollectionBuilder } from '@nocobase/db';

export function createAIToolMessageCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'aiToolMessages',
    (c) => {
      c.bigInt('id').notNull();
      c.uuid('sessionId').nullable();
      c.bigInt('messageId').nullable();
      c.string('toolCallId').nullable().unique();
      c.string('toolName').nullable();
      c.string('status').nullable();
      c.json('content').nullable();
      c.string('invokeStatus').nullable();
      c.bigInt('invokeStartTime').nullable();
      c.bigInt('invokeEndTime').nullable();
      c.boolean('auto').nullable();
      c.string('execution').nullable();
      c.integer('interruptActionOrder').nullable();
      c.json('interruptAction').nullable();
      c.json('userDecision').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('id', { name: 'pk_ai_tool_messages' });
    },
    { ifNotExists: true, syncMetadata: false },
  );
}

import type { BuilderResult, CollectionBuilder } from '@nocobase/db';

export function createLCCheckpointWriteCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'lcCheckpointWrites',
    (c) => {
      c.string('threadId', { length: 128 }).notNull();
      c.string('checkpointNs', { length: 128, defaultValue: '' }).notNull();
      c.string('checkpointId', { length: 128 }).notNull();
      c.string('taskId', { length: 128 }).notNull();
      c.integer('idx').notNull();
      c.string('channel', { length: 128 }).notNull();
      c.string('type', { length: 128 }).nullable();
      c.blob('blob').notNull();
      c.primary(['threadId', 'checkpointNs', 'checkpointId', 'taskId', 'idx'], {
        name: 'pk_lc_checkpoint_writes',
      });
    },
    { ifNotExists: true, syncMetadata: false },
  );
}

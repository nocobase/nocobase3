import type { BuilderResult, CollectionBuilder } from '@nocobase/db';

export function createLCCheckpointCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'lcCheckpoints',
    (c) => {
      c.string('threadId', { length: 128 }).notNull();
      c.string('checkpointNs', { length: 128, defaultValue: '' }).notNull();
      c.string('checkpointId', { length: 128 }).notNull();
      c.string('parentCheckpointId', { length: 128 }).nullable();
      c.string('type', { length: 128 }).nullable();
      c.json('checkpoint').notNull();
      c.json('metadata', { defaultValue: {} }).notNull();
      c.primary(['threadId', 'checkpointNs', 'checkpointId'], {
        name: 'pk_lc_checkpoints',
      });
    },
    { ifNotExists: true, syncMetadata: false },
  );
}

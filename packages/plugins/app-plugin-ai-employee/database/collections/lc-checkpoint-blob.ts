import type { BuilderResult, CollectionBuilder } from '@nocobase/db';

export function createLCCheckpointBlobCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'lcCheckpointBlobs',
    (c) => {
      c.string('threadId', { length: 128 }).notNull();
      c.string('checkpointNs', { length: 128, defaultValue: '' }).notNull();
      c.string('channel', { length: 128 }).notNull();
      c.string('version', { length: 128 }).notNull();
      c.string('type', { length: 128 }).notNull();
      c.blob('blob').nullable();
      c.primary(['threadId', 'checkpointNs', 'channel', 'version'], {
        name: 'pk_lc_checkpoint_blobs',
      });
    },
    { ifNotExists: true, syncMetadata: false },
  );
}

import type { CollectionRepository } from './collection.js';

export type LCCheckpointBlobEntity = {
  threadId: string;
  checkpointNs: string;
  channel: string;
  version: string;
  type: string;
  blob?: Uint8Array | string;
};

export interface LCCheckpointBlobRepository extends CollectionRepository<LCCheckpointBlobEntity> {}

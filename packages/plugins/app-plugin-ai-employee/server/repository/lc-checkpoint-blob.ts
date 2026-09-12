import type { CollectionRepository } from '@nocobase/ai-employee';

export type LCCheckpointBlobEntity = {
  threadId: string;
  checkpointNs: string;
  channel: string;
  version: string;
  type: string;
  blob?: Uint8Array | string;
};

export interface LCCheckpointBlobRepository extends CollectionRepository<LCCheckpointBlobEntity> {}

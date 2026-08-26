import type { CollectionRepository } from '../../repository/collection.js';

export type LCCheckpointWriteEntity = {
  threadId: string;
  checkpointNs: string;
  checkpointId: string;
  taskId: string;
  idx: number;
  channel: string;
  type?: string;
  blob: Uint8Array | string;
};

export interface LCCheckpointWriteRepository extends CollectionRepository<LCCheckpointWriteEntity> {}

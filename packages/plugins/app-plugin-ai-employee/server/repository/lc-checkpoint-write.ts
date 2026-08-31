import type { CollectionRepository } from '@nocobase/ai-employee';

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

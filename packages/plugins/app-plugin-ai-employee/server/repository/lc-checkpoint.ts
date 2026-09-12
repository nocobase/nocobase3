import type { CollectionRepository } from '@nocobase/ai-employee';

export type LCCheckpointEntity = {
  threadId: string;
  checkpointNs: string;
  checkpointId: string;
  parentCheckpointId?: string;
  type?: string;
  checkpoint: unknown;
  metadata?: Record<string, unknown>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export interface LCCheckpointRepository extends CollectionRepository<LCCheckpointEntity> {}

import type { CollectionRepository } from '@nocobase/ai-employee';
import type { AIMessage } from '@nocobase/ai-employee';

export type AIMessageEntity = AIMessage & {
  id?: string | number | bigint;
  updatedAt?: Date | string;
};

export interface AIMessageRepository extends CollectionRepository<AIMessageEntity> {
  findById?(id: string | number): Promise<AIMessageEntity | null>;
}

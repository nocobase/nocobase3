import type { CollectionRepository } from '../../repository/collection.js';
import type { AIMessage } from '../../ai-employees/types/ai-message.type.js';

export type AIMessageEntity = AIMessage & {
  id?: string | number | bigint;
  updatedAt?: Date | string;
};

export interface AIMessageRepository extends CollectionRepository<AIMessageEntity> {
  findById?(id: string | number): Promise<AIMessageEntity | null>;
}

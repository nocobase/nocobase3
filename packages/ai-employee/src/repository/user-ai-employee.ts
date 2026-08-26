import type { CollectionRepository } from './collection.js';

export type UserAIEmployeeEntity = {
  userId: string | number | bigint;
  aiEmployee: string;
  sort?: number | null;
  prompt?: string;
};

export interface UserAIEmployeeRepository extends CollectionRepository<UserAIEmployeeEntity> {}

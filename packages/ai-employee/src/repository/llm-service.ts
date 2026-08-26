import type { CollectionRepository } from './collection.js';

export type LLMServiceEntity = {
  name: string;
  title: string;
  provider: string;
  options: Record<string, unknown>;
  enabledModels: unknown;
  modelOptions?: Record<string, unknown>;
  builtIn?: boolean;
  enabled: boolean;
  sort: number;
};

export interface LLMServiceRepository extends CollectionRepository<LLMServiceEntity> {}

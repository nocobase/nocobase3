import type { EnabledModelsConfig } from '../manager/llm-service/types.js';
import type { CollectionRepository } from './collection.js';

export type LLMServiceEntity = {
  name: string;
  title: string;
  provider: string;
  options: Record<string, unknown>;
  enabledModels: EnabledModelsConfig | string[] | null;
  modelOptions?: Record<string, unknown>;
  builtIn?: boolean;
  enabled: boolean;
  sort: number;
};

export interface LLMServiceRepository extends CollectionRepository<LLMServiceEntity> {}

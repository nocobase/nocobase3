import type { CollectionRepository } from '../../repository/collection.js';

export type AISettingsEntity = {
  options?: Record<string, unknown>;
  defaultLLMService?: string;
  defaultModel?: string;
};

export interface AISettingsRepository extends CollectionRepository<AISettingsEntity> {}

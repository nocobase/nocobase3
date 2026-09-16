import type { CollectionRepository } from '@nocobase/ai-employee';

export type AISettingsEntity = {
  options?: Record<string, unknown>;
  defaultLlmService?: string;
  defaultModel?: string;
};

export interface AISettingsRepository extends CollectionRepository<AISettingsEntity> {}

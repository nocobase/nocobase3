/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Team.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type {
  LLMServiceEntity,
  LLMServiceRepository,
} from '../../repository/index.js';

export type EnabledModelsConfigItem = {
  label: string;
  value: string;
};
export type EnabledModelsMode = 'recommended' | 'provider' | 'custom';

export type EnabledModelsConfig = {
  mode: EnabledModelsMode;
  models: EnabledModelsConfigItem[];
};

export function normalizeEnabledModelsConfig(
  value: EnabledModelsConfig | string[] | null | undefined,
): EnabledModelsConfig {
  if (Array.isArray(value)) {
    return {
      mode: 'custom',
      models: value.flatMap((model) => {
        if (typeof model !== 'string' || !model.trim()) return [];
        const normalized = model.trim();
        return [{ label: normalized, value: normalized }];
      }),
    };
  }
  return value ?? DEFAULT_ENABLED_MODELS;
}
export const DEFAULT_ENABLED_MODELS: EnabledModelsConfig = {
  mode: 'recommended',
  models: [],
};

export type LLMServiceOptions = {
  name: string;
  title?: string;
  provider: string;
  options?: Record<string, unknown>;
  enabledModels?: EnabledModelsConfig | string[] | null;
  modelOptions?: Record<string, unknown>;
  enabled?: boolean;
  sort?: number;
};

export type LLMServiceQuery = {
  name?: string;
  provider?: string;
  enabled?: boolean;
};

export interface LLMServiceManager {
  getLLMService(name: string): Promise<LLMServiceEntity | undefined>;
  listLLMServices(query?: LLMServiceQuery): Promise<LLMServiceEntity[]>;
  registerLLMService(
    options: LLMServiceOptions,
    behavior?: { preserveUserState?: boolean },
  ): Promise<LLMServiceEntity>;
  switchRepository(repository: LLMServiceRepository): Promise<void>;
  deleteLLMService(name: string): Promise<void>;
}

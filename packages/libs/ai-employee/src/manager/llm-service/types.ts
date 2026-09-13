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
export type EnabledModelsMode = 'provider' | 'custom';

export type EnabledModelsConfig = {
  mode: EnabledModelsMode;
  models: EnabledModelsConfigItem[];
};

export function normalizeEnabledModelsConfig(
  value: unknown,
): EnabledModelsConfig {
  if (Array.isArray(value)) {
    return {
      mode: 'custom',
      models: normalizeModelItems(value),
    };
  }
  if (!value || typeof value !== 'object') return { ...DEFAULT_ENABLED_MODELS };
  const record = value as { mode?: unknown; models?: unknown };
  if (record.mode !== 'provider' && record.mode !== 'custom') {
    return { ...DEFAULT_ENABLED_MODELS };
  }
  return {
    mode: record.mode,
    models: normalizeModelItems(record.models),
  };
}
export const DEFAULT_ENABLED_MODELS: EnabledModelsConfig = {
  mode: 'provider',
  models: [],
};

function normalizeModelItems(value: unknown): EnabledModelsConfigItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((model) => {
    if (typeof model === 'string') {
      const normalized = model.trim();
      if (!normalized || seen.has(normalized)) return [];
      seen.add(normalized);
      return [{ label: normalized, value: normalized }];
    }
    if (
      !model ||
      typeof model !== 'object' ||
      typeof (model as { value?: unknown }).value !== 'string'
    )
      return [];
    const item = model as { label?: unknown; value: string };
    const normalized = item.value.trim();
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [
      {
        label:
          typeof item.label === 'string' && item.label.trim()
            ? item.label.trim()
            : normalized,
        value: normalized,
      },
    ];
  });
}

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

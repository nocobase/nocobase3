import type { ApiClient } from '@nocobase/app-client';

import { requestAIAction } from './api-client.js';

export type EnabledModel = { label: string; value: string };
export type EnabledModelsConfig = {
  mode: 'recommended' | 'provider' | 'custom';
  models: EnabledModel[];
};
export type LLMProvider = {
  name: string;
  title: string;
  supportedModel: Array<'LLM' | 'EMBEDDING'>;
  recommendedModels: EnabledModel[];
};
export type LLMService = {
  name: string;
  title: string;
  provider: string;
  enabled: boolean;
  enabledModels: EnabledModelsConfig;
  options?: Record<string, unknown>;
};

function dataOf(value: unknown): unknown {
  if (value && typeof value === 'object' && 'data' in value) return value.data;
  return value;
}

export function normalizeEnabledModels(value: unknown): EnabledModelsConfig {
  if (Array.isArray(value))
    return {
      mode: 'custom',
      models: value.flatMap((item) => {
        if (typeof item !== 'string' || !item.trim()) return [];
        const model = item.trim();
        return [{ label: model, value: model }];
      }),
    };
  if (!value || typeof value !== 'object')
    return { mode: 'recommended', models: [] };
  const record = value as { mode?: unknown; models?: unknown };
  const mode =
    record.mode === 'recommended' ||
    record.mode === 'provider' ||
    record.mode === 'custom'
      ? record.mode
      : 'recommended';
  if (mode === 'recommended' && record.mode !== 'recommended') {
    return { mode: 'recommended', models: [] };
  }
  const models = Array.isArray(record.models)
    ? record.models.flatMap((item) => {
        if (
          !item ||
          typeof item !== 'object' ||
          typeof (item as { value?: unknown }).value !== 'string'
        )
          return [];
        const model = item as { label?: unknown; value: string };
        const value = model.value.trim();
        return value
          ? [
              {
                label:
                  typeof model.label === 'string' && model.label.trim()
                    ? model.label.trim()
                    : value,
                value,
              },
            ]
          : [];
      })
    : [];
  return { mode, models };
}

export function prepareEnabledModels(
  config: EnabledModelsConfig,
): EnabledModelsConfig {
  if (config.mode === 'recommended') return { mode: 'recommended', models: [] };
  const seen = new Set<string>();
  const models = config.models.map((model) => {
    const value = model.value.trim();
    if (!value) throw new Error('Model ID is required.');
    if (seen.has(value)) throw new Error(`Duplicate Model ID: ${value}`);
    seen.add(value);
    const label = model.label.trim() || value;
    return { label, value };
  });
  return { mode: config.mode, models };
}

export async function listLLMServices(
  client?: ApiClient,
): Promise<LLMService[]> {
  const response = await requestAIAction<unknown>(
    'llmServices',
    'list',
    { method: 'GET' },
    client,
  );
  const value = dataOf(response);
  return (Array.isArray(value) ? value : [])
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object'),
    )
    .map((item) => ({
      name: String(item.name ?? ''),
      title: String(item.title ?? item.name ?? ''),
      provider: String(item.provider ?? ''),
      enabled: item.enabled !== false,
      enabledModels: normalizeEnabledModels(item.enabledModels),
      options: item.options as Record<string, unknown> | undefined,
    }));
}

export async function listLLMProviders(
  client?: ApiClient,
): Promise<LLMProvider[]> {
  const response = await requestAIAction<unknown>(
    'ai',
    'listLLMProviders',
    { method: 'GET' },
    client,
  );
  const value = dataOf(response);
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const provider = item as Record<string, unknown>;
    return [
      {
        name: String(provider.name ?? ''),
        supportedModel: Array.isArray(provider.supportedModel)
          ? provider.supportedModel.filter(
              (item): item is 'LLM' | 'EMBEDDING' =>
                item === 'LLM' || item === 'EMBEDDING',
            )
          : ['LLM'],
        title: String(provider.title ?? provider.name ?? ''),
        recommendedModels: normalizeEnabledModels({
          mode: 'provider',
          models: provider.recommendedModels,
        }).models,
      },
    ];
  });
}

export async function updateLLMService(
  name: string,
  values: { enabled?: boolean; enabledModels?: EnabledModelsConfig },
  client?: ApiClient,
): Promise<LLMService> {
  const response = await requestAIAction<unknown>(
    'llmServices',
    'update',
    {
      method: 'PUT',
      query: { key: name },
      body: values,
    },
    client,
  );
  const value = dataOf(response);
  if (!value || typeof value !== 'object')
    throw new Error('LLM service response is invalid.');
  const item = value as Record<string, unknown>;
  return {
    name: String(item.name ?? name),
    title: String(item.title ?? name),
    provider: String(item.provider ?? ''),
    enabled: item.enabled !== false,
    enabledModels: normalizeEnabledModels(item.enabledModels),
    options: item.options as Record<string, unknown> | undefined,
  };
}

export async function listProviderModels(
  llmService: string,
  search?: string,
  client?: ApiClient,
): Promise<EnabledModel[]> {
  const response = await requestAIAction<unknown>(
    'ai',
    'listProviderModels',
    {
      method: 'POST',
      body: { llmService, search },
    },
    client,
  );
  const value = dataOf(response);
  return (Array.isArray(value) ? value : []).flatMap((item) =>
    typeof item === 'object' &&
    item &&
    typeof (item as { id?: unknown }).id === 'string'
      ? [
          {
            label: (item as { id: string }).id,
            value: (item as { id: string }).id,
          },
        ]
      : [],
  );
}

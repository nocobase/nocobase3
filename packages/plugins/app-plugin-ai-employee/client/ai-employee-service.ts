import type { ApiClient } from '@nocobase/app-client';

import { requestAIAction } from './api-client.js';

export interface AIEmployeeModelRef {
  llmService: string;
  model: string;
}

export interface AIEmployeeModelSettings extends Record<string, unknown> {
  enabled?: boolean;
  llmService?: string;
  model?: string;
  models?: AIEmployeeModelRef[];
}

export interface AIEmployeeKnowledgeBaseSettings extends Record<
  string,
  unknown
> {
  knowledgeBaseKeys?: string[];
  topK?: number;
  score?: number;
  retrievalStrategy?: 'always' | 'onDemand';
}

export interface AIEmployeeToolSetting extends Record<string, unknown> {
  name: string;
  autoCall?: boolean;
}

export interface AIEmployeeRecord extends Record<string, unknown> {
  username: string;
  nickname?: string;
  position?: string;
  avatar?: string;
  bio?: string;
  greeting?: string;
  about?: string | null;
  defaultPrompt?: string | null;
  enabled?: boolean;
  builtIn?: boolean;
  deprecated?: boolean;
  category?: string;
  modelSettings?: AIEmployeeModelSettings;
  enableKnowledgeBase?: boolean;
  knowledgeBasePrompt?: string | null;
  knowledgeBase?: AIEmployeeKnowledgeBaseSettings;
  missingKnowledgeBaseKeys?: string[];
  skillSettings?: {
    enabledSkills?: string[] | null;
    enabledTools?: string[] | null;
    skills?: string[];
    tools?: AIEmployeeToolSetting[];
  };
}

export interface EnabledModelOption extends AIEmployeeModelRef {
  label: string;
  serviceTitle: string;
}

export interface KnowledgeBaseOption {
  key: string;
  name: string;
  enabled: boolean;
}

export interface AIMetadataItem {
  name: string;
  i18n?: { namespace: string };
  title?: string;
  description?: string;
  about?: string;
  scope?: string;
  from?: string;
  defaultPermission?: string;
  tools?: string[];
}

export interface AIEmployeeEditableValues {
  enabled: boolean;
  about: string | null;
  modelSettings: AIEmployeeModelSettings;
  skillSettings: {
    enabledSkills?: string[] | null;
    enabledTools?: string[] | null;
    skills: string[];
    tools: AIEmployeeToolSetting[];
  };
  enableKnowledgeBase: boolean;
  knowledgeBasePrompt: string;
  knowledgeBase: AIEmployeeKnowledgeBaseSettings;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function unwrapResponseData(value: unknown): unknown {
  let current = value;
  while (isRecord(current) && 'data' in current) current = current.data;
  return current;
}

export function hasKnowledgeBaseDataPlaceholder(value: string): boolean {
  return value.includes('{knowledgeBaseData}');
}

export function normalizeArrayResponse<T>(value: unknown): T[] {
  const data = unwrapResponseData(value);
  if (Array.isArray(data)) return data as T[];
  if (!isRecord(data)) return [];
  for (const key of ['rows', 'items', 'list']) {
    if (Array.isArray(data[key])) return data[key] as T[];
  }
  return [];
}

export function buildEditableValues(
  employee: AIEmployeeRecord,
): AIEmployeeEditableValues {
  return {
    enabled: employee.enabled !== false,
    about: employee.about ?? null,
    modelSettings: { ...(employee.modelSettings ?? {}) },
    skillSettings: {
      ...(employee.skillSettings?.enabledSkills !== undefined
        ? {
            enabledSkills:
              employee.skillSettings.enabledSkills === null
                ? null
                : [...employee.skillSettings.enabledSkills],
          }
        : {}),
      ...(employee.skillSettings?.enabledTools !== undefined
        ? {
            enabledTools:
              employee.skillSettings.enabledTools === null
                ? null
                : [...employee.skillSettings.enabledTools],
          }
        : {}),
      skills: [...(employee.skillSettings?.skills ?? [])],
      tools: (employee.skillSettings?.tools ?? []).map((tool) => ({ ...tool })),
    },
    enableKnowledgeBase: employee.enableKnowledgeBase === true,
    knowledgeBasePrompt: employee.knowledgeBasePrompt ?? '',
    knowledgeBase: {
      ...(employee.knowledgeBase ?? {}),
      retrievalStrategy:
        employee.knowledgeBase?.retrievalStrategy === 'onDemand'
          ? 'onDemand'
          : 'always',
    },
  };
}

export function buildAIEmployeeUpdatePayload(
  employee: AIEmployeeRecord,
  editable: AIEmployeeEditableValues,
): AIEmployeeEditableValues {
  return {
    enabled: editable.enabled,
    about: editable.about,
    modelSettings: {
      ...(employee.modelSettings ?? {}),
      ...editable.modelSettings,
    },
    skillSettings: {
      ...(editable.skillSettings.enabledSkills !== undefined
        ? {
            enabledSkills:
              editable.skillSettings.enabledSkills === null
                ? null
                : [...editable.skillSettings.enabledSkills],
          }
        : {}),
      ...(editable.skillSettings.enabledTools !== undefined
        ? {
            enabledTools:
              editable.skillSettings.enabledTools === null
                ? null
                : [...editable.skillSettings.enabledTools],
          }
        : {}),
      skills: [...editable.skillSettings.skills],
      tools: editable.skillSettings.tools.map((tool) => ({ ...tool })),
    },
    enableKnowledgeBase: editable.enableKnowledgeBase,
    knowledgeBasePrompt: editable.knowledgeBasePrompt,
    knowledgeBase: {
      ...(employee.knowledgeBase ?? {}),
      ...editable.knowledgeBase,
      knowledgeBaseKeys: editable.knowledgeBase.knowledgeBaseKeys ?? [],
    },
  };
}

export async function listAIEmployees(
  signal?: AbortSignal,
  client?: ApiClient,
): Promise<AIEmployeeRecord[]> {
  const response = await requestAIAction<unknown>(
    'aiEmployees',
    'list',
    { method: 'GET', signal },
    client,
  );
  return normalizeArrayResponse<AIEmployeeRecord>(response).filter(
    (employee) => !employee.deprecated,
  );
}

export async function getAIEmployee(
  username: string,
  signal?: AbortSignal,
  client?: ApiClient,
): Promise<AIEmployeeRecord> {
  const response = await requestAIAction<unknown>(
    'aiEmployees',
    'get',
    { method: 'GET', query: { key: username }, signal },
    client,
  );
  const data = unwrapResponseData(response);
  if (!isRecord(data)) throw new Error('AI employee response is invalid.');
  return data as AIEmployeeRecord;
}

export async function updateAIEmployee(
  employee: AIEmployeeRecord,
  editable: AIEmployeeEditableValues,
  client?: ApiClient,
): Promise<AIEmployeeRecord> {
  const response = await requestAIAction<unknown>(
    'aiEmployees',
    'update',
    {
      method: 'PUT',
      query: { key: employee.username },
      body: buildAIEmployeeUpdatePayload(employee, editable),
    },
    client,
  );
  const data = unwrapResponseData(response);
  if (!isRecord(data)) {
    return { ...employee, ...buildAIEmployeeUpdatePayload(employee, editable) };
  }
  return data as AIEmployeeRecord;
}

export async function listEnabledModels(
  signal?: AbortSignal,
  client?: ApiClient,
): Promise<EnabledModelOption[]> {
  const response = await requestAIAction<unknown>(
    'ai',
    'listAllEnabledModels',
    { method: 'GET', signal },
    client,
  );
  return normalizeArrayResponse<UnknownRecord>(response).flatMap((service) => {
    const llmService = String(service.llmService ?? service.name ?? '');
    const serviceTitle = String(
      service.llmServiceTitle ?? service.title ?? llmService,
    );
    const models = Array.isArray(service.enabledModels)
      ? service.enabledModels
      : [];
    return models.flatMap((model) => {
      if (!isRecord(model) || !llmService || typeof model.value !== 'string')
        return [];
      return [
        {
          llmService,
          model: model.value,
          label: String(model.label ?? model.value),
          serviceTitle,
        },
      ];
    });
  });
}

export async function listEnabledKnowledgeBases(
  signal?: AbortSignal,
  client?: ApiClient,
): Promise<KnowledgeBaseOption[]> {
  const response = await requestAIAction<unknown>(
    'aiKnowledgeBase',
    'list',
    {
      method: 'GET',
      query: { paginate: false, 'filter[enabled]': true },
      signal,
    },
    client,
  );
  return normalizeArrayResponse<UnknownRecord>(response).flatMap((item) =>
    typeof item.key === 'string' && item.enabled !== false
      ? [
          {
            key: item.key,
            name: String(item.name ?? item.key),
            enabled: item.enabled !== false,
          },
        ]
      : [],
  );
}

async function listMetadata(
  resource: 'aiSkills' | 'aiTools',
  signal?: AbortSignal,
  client?: ApiClient,
): Promise<AIMetadataItem[]> {
  const response = await requestAIAction<unknown>(
    resource,
    'list',
    { method: 'GET', signal },
    client,
  );
  return normalizeArrayResponse<UnknownRecord>(
    response,
  ).flatMap<AIMetadataItem>((item) => {
    const definition = isRecord(item.definition) ? item.definition : item;
    const name = definition.name;
    if (typeof name !== 'string') return [];
    const i18n =
      isRecord(item.i18n) && typeof item.i18n.namespace === 'string'
        ? { namespace: item.i18n.namespace }
        : undefined;
    if (resource === 'aiSkills') {
      const introduction = isRecord(item.introduction) ? item.introduction : {};
      return [
        {
          name,
          i18n,
          title:
            typeof introduction.title === 'string'
              ? introduction.title
              : typeof item.title === 'string'
                ? item.title
                : undefined,
          description:
            typeof item.description === 'string' ? item.description : undefined,
          about:
            typeof introduction.about === 'string'
              ? introduction.about
              : undefined,
          scope: typeof item.scope === 'string' ? item.scope : undefined,
          from: typeof item.from === 'string' ? item.from : undefined,
          tools: Array.isArray(item.tools)
            ? item.tools.filter(
                (name): name is string => typeof name === 'string',
              )
            : undefined,
        },
      ];
    }
    const introduction = isRecord(item.introduction) ? item.introduction : {};
    return [
      {
        name,
        i18n,
        title:
          typeof introduction.title === 'string'
            ? introduction.title
            : typeof definition.title === 'string'
              ? definition.title
              : typeof item.title === 'string'
                ? item.title
                : undefined,
        description:
          typeof item.about === 'string'
            ? item.about
            : typeof definition.description === 'string'
              ? definition.description
              : typeof item.description === 'string'
                ? item.description
                : undefined,
        about:
          typeof introduction.about === 'string'
            ? introduction.about
            : typeof item.about === 'string'
              ? item.about
              : undefined,
        scope: typeof item.scope === 'string' ? item.scope : undefined,
        from: typeof item.from === 'string' ? item.from : undefined,
        defaultPermission:
          typeof item.defaultPermission === 'string'
            ? item.defaultPermission
            : undefined,
      },
    ];
  });
}

export const listAISkills = (
  signal?: AbortSignal,
  client?: ApiClient,
): Promise<AIMetadataItem[]> => listMetadata('aiSkills', signal, client);
export const listAITools = (
  signal?: AbortSignal,
  client?: ApiClient,
): Promise<AIMetadataItem[]> => listMetadata('aiTools', signal, client);

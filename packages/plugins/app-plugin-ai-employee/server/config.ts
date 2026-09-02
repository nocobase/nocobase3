import {
  defineAppConfig,
  type AppConfigDefinition,
} from '@nocobase/app-server/config';
import type {
  EnabledModelsConfig,
  LLMServiceOptions,
} from '@nocobase/ai-employee';
import { Type } from '@sinclair/typebox';

export interface AIStorageConfig {
  readonly disk?: readonly string[];
}

export type AIEmployeeLLMServiceConfig = LLMServiceOptions;

export interface AIApplicationConfig {
  readonly storage?: AIStorageConfig;
  readonly aiEmployee?: {
    readonly storage?: AIStorageConfig;
  };
  readonly aiKnowledgeBase?: {
    readonly storage?: AIStorageConfig;
  };
  readonly llmServices: AIEmployeeLLMServiceConfig[];
  readonly [key: string]: unknown;
}

export type AIEmployeeConfig = AIApplicationConfig;

const storageSchema = Type.Object(
  {
    disk: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

const enabledModelItemSchema = Type.Object(
  {
    label: Type.String(),
    value: Type.String(),
  },
  { additionalProperties: false },
);

const enabledModelsSchema = Type.Union([
  Type.Array(Type.String()),
  Type.Object(
    {
      mode: Type.Union([
        Type.Literal('recommended'),
        Type.Literal('provider'),
        Type.Literal('custom'),
      ]),
      models: Type.Array(enabledModelItemSchema),
    },
    { additionalProperties: false },
  ),
  Type.Null(),
]);

const llmServiceSchema = Type.Object(
  {
    name: Type.String({ pattern: '.*\\S.*' }),
    title: Type.Optional(Type.String()),
    provider: Type.String({ pattern: '.*\\S.*' }),
    options: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    enabledModels: Type.Optional(enabledModelsSchema),
    modelOptions: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    enabled: Type.Optional(Type.Boolean()),
    sort: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
);

export const aiConfig: AppConfigDefinition<AIApplicationConfig> =
  defineAppConfig({
    namespace: 'ai',
    schema: Type.Unsafe<AIApplicationConfig>(
      Type.Object(
        {
          storage: storageSchema,
          aiEmployee: Type.Object(
            { storage: storageSchema },
            { additionalProperties: false },
          ),
          aiKnowledgeBase: Type.Object(
            { storage: storageSchema },
            { additionalProperties: false },
          ),
          llmServices: Type.Array(llmServiceSchema, {
            uniqueItemProperties: ['name'],
          }),
        },
        { additionalProperties: true },
      ),
    ),
    defaults: {
      storage: {},
      aiEmployee: { storage: {} },
      aiKnowledgeBase: { storage: {} },
      llmServices: [],
    },
  });

export const aiEmployeeConfig: AppConfigDefinition<AIApplicationConfig> =
  aiConfig;

export type AIEmployeeEnabledModelsConfig = EnabledModelsConfig;

export function normalizeDisks(
  disks: readonly string[] | undefined,
): readonly string[] {
  if (!disks) return [];
  return [...new Set(disks.map((disk) => disk.trim()).filter(Boolean))];
}

export function resolveAIEmployeeStorageDisk(
  config: AIApplicationConfig,
  defaultDisk: string,
): string {
  const employee = normalizeDisks(config.aiEmployee?.storage?.disk);
  const configured =
    employee.length > 0 ? employee : normalizeDisks(config.storage?.disk);
  return configured[0] ?? defaultDisk;
}

export function resolveAIKnowledgeBaseStorageDisks(
  config: AIApplicationConfig,
  defaultDisk: string,
): readonly string[] {
  const knowledgeBase = normalizeDisks(config.aiKnowledgeBase?.storage?.disk);
  if (knowledgeBase.length > 0) return knowledgeBase;
  const shared = normalizeDisks(config.storage?.disk);
  return shared.length > 0 ? shared : [defaultDisk];
}

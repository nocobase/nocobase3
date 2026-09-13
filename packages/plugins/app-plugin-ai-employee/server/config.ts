import {
  defineAppConfig,
  type AppConfigDefinition,
} from '@nocobase/app-server/config';
import type {
  MCPOptions,
  EnabledModelsConfig,
  LLMServiceOptions,
} from '@nocobase/ai-employee';
import { Type } from '@sinclair/typebox';

export interface AIStorageConfig {
  readonly disk?: readonly string[];
}

export interface AIKnowledgeBaseVectorDatabaseConnectionConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password?: string;
  readonly database: string;
  readonly tableName: string;
}

export interface AIKnowledgeBaseVectorDatabaseConfig {
  readonly name: string;
  readonly provider?: string;
  readonly databaseSpec?: string;
  readonly connection: AIKnowledgeBaseVectorDatabaseConnectionConfig;
  readonly enabled?: boolean;
}

export interface AIKnowledgeBaseManifestConfig {
  readonly disk: string;
  readonly locations: readonly string[];
}

export interface AIKnowledgeBaseConfig {
  readonly storage?: AIStorageConfig;
  readonly vectorDatabases?: readonly AIKnowledgeBaseVectorDatabaseConfig[];
  readonly manifests?: readonly AIKnowledgeBaseManifestConfig[];
}

export interface AIEmployeeEnabledModelConfig {
  readonly label: string;
  readonly value: string;
}

export type AIEmployeeLLMServiceConfig = Omit<
  LLMServiceOptions,
  'enabledModels'
> & {
  readonly enabledModels?: readonly AIEmployeeEnabledModelConfig[];
};

export interface AISkillsConfig {
  readonly paths?: readonly string[];
}

export interface AIApplicationConfig {
  readonly storage?: AIStorageConfig;
  readonly aiEmployee?: {
    readonly storage?: AIStorageConfig;
  };
  readonly skills?: AISkillsConfig;
  readonly aiKnowledgeBase?: AIKnowledgeBaseConfig;
  readonly llmServices: AIEmployeeLLMServiceConfig[];
  readonly mcpServers?: Readonly<Record<string, MCPOptions>>;
  readonly [key: string]: unknown;
}

export type AIEmployeeConfig = AIApplicationConfig;

const nonBlankStringSchema = Type.String({ pattern: '.*\\S.*' });
const manifestLocationSchema = Type.String({ pattern: '.*[^\\s/].*' });

const skillsSchema = Type.Object(
  { paths: Type.Optional(Type.Array(Type.String(), { default: [] })) },
  { additionalProperties: false },
);

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

const enabledModelsSchema = Type.Array(enabledModelItemSchema);

const vectorDatabaseConnectionSchema = Type.Object(
  {
    host: nonBlankStringSchema,
    port: Type.Integer({ minimum: 1, maximum: 65535 }),
    user: nonBlankStringSchema,
    password: Type.Optional(Type.String()),
    database: nonBlankStringSchema,
    tableName: nonBlankStringSchema,
  },
  { additionalProperties: false },
);

const vectorDatabaseSchema = Type.Object(
  {
    name: nonBlankStringSchema,
    provider: Type.Optional(nonBlankStringSchema),
    databaseSpec: Type.Optional(nonBlankStringSchema),
    connection: vectorDatabaseConnectionSchema,
    enabled: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const manifestConfigSchema = Type.Object(
  {
    disk: nonBlankStringSchema,
    locations: Type.Array(manifestLocationSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);

const llmServiceSchema = Type.Object(
  {
    name: nonBlankStringSchema,
    title: Type.Optional(Type.String()),
    provider: nonBlankStringSchema,
    options: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    enabledModels: Type.Optional(enabledModelsSchema),
    modelOptions: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    enabled: Type.Optional(Type.Boolean()),
    sort: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
);

const mcpServerSchema = Type.Object(
  {
    title: Type.Optional(Type.String()),
    transport: Type.Union([
      Type.Literal('stdio'),
      Type.Literal('sse'),
      Type.Literal('http'),
    ]),
    command: Type.Optional(Type.String()),
    args: Type.Optional(Type.Array(Type.String())),
    env: Type.Optional(Type.Record(Type.String(), Type.String())),
    url: Type.Optional(Type.String()),
    enabled: Type.Optional(Type.Boolean()),
    headers: Type.Optional(Type.Record(Type.String(), Type.String())),
    restart: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
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
          skills: Type.Optional(skillsSchema),
          aiKnowledgeBase: Type.Object(
            {
              storage: storageSchema,
              vectorDatabases: Type.Array(vectorDatabaseSchema, {
                uniqueItemProperties: ['name'],
              }),
              manifests: Type.Array(manifestConfigSchema),
            },
            { additionalProperties: false },
          ),
          llmServices: Type.Array(llmServiceSchema, {
            uniqueItemProperties: ['name'],
          }),
          mcpServers: Type.Optional(
            Type.Record(Type.String(), mcpServerSchema),
          ),
        },
        { additionalProperties: true },
      ),
    ),
    defaults: {
      storage: {},
      aiEmployee: { storage: {} },
      skills: { paths: [] },
      aiKnowledgeBase: {
        storage: {},
        vectorDatabases: [],
        manifests: [],
      },
      llmServices: [],
      mcpServers: {},
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

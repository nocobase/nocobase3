import type {
  EnabledModelsConfig,
  LLMServiceOptions,
  MCPOptions,
} from '@nocobase/ai-employee';

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

/**
 * `key` is the unique identifier of a vector database entry within one
 * configuration, and is what synchronization matches an existing record by.
 * `name` is an optional display title and falls back to `key` when omitted,
 * so two entries may share the same name.
 */
export interface AIKnowledgeBaseVectorDatabaseConfig {
  readonly key: string;
  readonly name?: string;
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

export interface AISkillsConfig {
  readonly paths?: readonly string[];
}
export type AIEmployeeLLMServiceConfig = Omit<
  LLMServiceOptions,
  'enabledModels'
> & {
  readonly enabledModels?: readonly AIEmployeeEnabledModelConfig[];
};

export interface AIApplicationConfig {
  readonly storage?: AIStorageConfig;
  readonly aiEmployee?: {
    readonly storage?: AIStorageConfig;
  };
  readonly skills?: AISkillsConfig;
  readonly mcpServers?: Readonly<Record<string, MCPOptions>>;
  readonly aiKnowledgeBase?: AIKnowledgeBaseConfig;
  readonly llmServices: AIEmployeeLLMServiceConfig[];
  readonly [key: string]: unknown;
}

export type AIEmployeeConfig = AIApplicationConfig;
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

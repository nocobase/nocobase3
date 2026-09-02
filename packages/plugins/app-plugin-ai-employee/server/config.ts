import {
  defineAppConfig,
  type AppConfigDefinition,
} from '@nocobase/app-server/config';
import { Type } from '@sinclair/typebox';

export interface AIStorageConfig {
  readonly disk?: readonly string[];
}

export interface AIApplicationConfig {
  readonly storage: AIStorageConfig;
  readonly aiEmployee: {
    readonly storage: AIStorageConfig;
  };
  readonly aiKnowledgeBase: {
    readonly storage: AIStorageConfig;
  };
}

const storageSchema = Type.Object(
  {
    disk: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

export const aiConfig: AppConfigDefinition<AIApplicationConfig> =
  defineAppConfig({
    namespace: 'ai',
    schema: Type.Object(
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
      },
      { additionalProperties: false },
    ),
    defaults: {
      storage: {},
      aiEmployee: { storage: {} },
      aiKnowledgeBase: { storage: {} },
    },
  });

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
  const employee = normalizeDisks(config.aiEmployee.storage.disk);
  const configured =
    employee.length > 0 ? employee : normalizeDisks(config.storage.disk);
  return configured[0] ?? defaultDisk;
}

export function resolveAIKnowledgeBaseStorageDisks(
  config: AIApplicationConfig,
  defaultDisk: string,
): readonly string[] {
  const knowledgeBase = normalizeDisks(config.aiKnowledgeBase.storage.disk);
  if (knowledgeBase.length > 0) return knowledgeBase;
  const shared = normalizeDisks(config.storage.disk);
  return shared.length > 0 ? shared : [defaultDisk];
}

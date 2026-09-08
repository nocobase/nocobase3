import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

const PROVIDER_DEFAULT = { mode: 'provider', models: [] } as const;

type LLMServiceRow = {
  name: string;
  enabledModels: unknown;
};

const migration: MigrationDefinition = defineMigration({
  name: '202609010001_remove_recommended_llm_models',
  irreversible: true,
  async up({ builder, query }: MigrationContext): Promise<void> {
    const services = await query
      .selectFrom<LLMServiceRow>('llmServices')
      .select(['name', 'enabledModels'])
      .execute();
    for (const service of services) {
      if (!hasRecommendedMode(service.enabledModels)) continue;
      await query
        .updateTable<LLMServiceRow>('llmServices')
        .set({ enabledModels: JSON.stringify(PROVIDER_DEFAULT) })
        .where('name', '=', service.name)
        .execute();
    }
    await builder.alterField(
      'llmServices',
      'enabledModels',
      {
        type: 'json',
        nullable: false,
        defaultValue: PROVIDER_DEFAULT,
      },
      { syncMetadata: false },
    );
  },
});

function hasRecommendedMode(value: unknown): boolean {
  const parsed = parseStoredConfig(value);
  return Boolean(
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    (parsed as { mode?: unknown }).mode === 'recommended',
  );
}

function parseStoredConfig(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export default migration;

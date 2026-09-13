import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';

import createMigration from '../database/migrations/202608260002_create_ai_employee.js';
import removeRecommendedModelsMigration from '../database/migrations/202609010001_remove_recommended_llm_models.js';

const managers: DatabaseManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((database) => database.destroy()));
});

describe('recommended LLM models migration', () => {
  it('migrates historical rows and installs the provider-mode default', async () => {
    const metadataStore = new InMemoryCollectionMetadataStore();
    const database = createDatabaseManager({
      default: 'main',
      metadataStore,
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    managers.push(database);
    await database.connect();
    const connection = database.connection();
    const context = {
      builder: database.builder(),
      query: connection.query,
      connection,
    };
    await createMigration.up(context);
    await context.query
      .insertInto('llmServices')
      .values([
        row('recommended-empty', { mode: 'recommended', models: [] }),
        row('recommended-stale', {
          mode: 'recommended',
          models: [{ label: 'Stale', value: 'stale' }],
        }),
        row('provider', {
          mode: 'provider',
          models: [{ label: 'Provider', value: 'provider-model' }],
        }),
        row('custom', {
          mode: 'custom',
          models: [{ label: 'Custom', value: 'custom-model' }],
        }),
        row('legacy-array', ['legacy-model']),
        { name: 'malformed', enabledModels: 'not-json' },
      ])
      .execute();

    await removeRecommendedModelsMigration.up(context);

    await expect(
      readEnabledModels(context.query, 'recommended-empty'),
    ).resolves.toEqual({
      mode: 'provider',
      models: [],
    });
    await expect(
      readEnabledModels(context.query, 'recommended-stale'),
    ).resolves.toEqual({
      mode: 'provider',
      models: [],
    });
    await expect(readEnabledModels(context.query, 'provider')).resolves.toEqual(
      {
        mode: 'provider',
        models: [{ label: 'Provider', value: 'provider-model' }],
      },
    );
    await expect(readEnabledModels(context.query, 'custom')).resolves.toEqual({
      mode: 'custom',
      models: [{ label: 'Custom', value: 'custom-model' }],
    });
    await expect(
      readEnabledModels(context.query, 'legacy-array'),
    ).resolves.toEqual(['legacy-model']);
    await expect(readEnabledModels(context.query, 'malformed')).resolves.toBe(
      'not-json',
    );

    await context.query
      .insertInto('llmServices')
      .values({ name: 'new' })
      .execute();
    await expect(readEnabledModels(context.query, 'new')).resolves.toEqual({
      mode: 'provider',
      models: [],
    });

    const physical = await connection.schemaInspector.getPhysicalCollection({
      tableName: 'llm_services',
    });
    const column = physical?.columns.find(
      ({ columnName }) => columnName === 'enabled_models',
    );
    expect(column).toMatchObject({ nullable: false });
    expect(JSON.parse(String(column?.default?.value))).toEqual({
      mode: 'provider',
      models: [],
    });

    const resolved = await connection.collections.get('llmServices');
    const field = resolved?.fields.find(({ name }) => name === 'enabledModels');
    expect(field).toMatchObject({
      name: 'enabledModels',
      type: 'json',
      nullable: false,
    });
    expect(JSON.parse(String(field?.defaultValue))).toEqual({
      mode: 'provider',
      models: [],
    });
    await expect(metadataStore.get('llmServices')).resolves.toBeUndefined();
  });
});

function row(name: string, enabledModels: unknown): Record<string, unknown> {
  return { name, enabledModels: JSON.stringify(enabledModels) };
}

async function readEnabledModels(
  query: ReturnType<DatabaseManager['connection']>['query'],
  name: string,
): Promise<unknown> {
  const value = await query
    .selectFrom('llmServices')
    .select('enabledModels')
    .where('name', '=', name)
    .value('enabledModels');
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

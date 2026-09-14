import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * This plugin used to serialize its own JSON fields before handing them to the
 * Query layer, which serializes them again. Every value it wrote therefore
 * reached the column as a JSON *string* holding JSON text rather than as the
 * JSON value itself, and reading it back only worked because the plugin parsed
 * the extra layer off again. Rows that took a column default were written by
 * the database and carry no extra layer.
 *
 * The plugin no longer encodes, so the extra layer has to come off the stored
 * data. Telling the two apart needs no guesswork: a double-encoded value
 * decodes to a string and a correctly stored one does not, and none of these
 * fields is written as a bare JSON string by any caller.
 *
 * The tables and fields are spelled out here rather than read from the
 * collection definitions, which keep evolving.
 */
const DOUBLE_ENCODED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  aiConversations: ['options'],
  aiEmployees: [
    'chatSettings',
    'skillSettings',
    'modelSettings',
    'dataSourceSettings',
    'knowledgeBase',
  ],
  aiFiles: ['meta'],
  aiMcpClients: ['args', 'env', 'headers', 'restart'],
  aiMessages: [
    'content',
    'toolCalls',
    'attachments',
    'workContext',
    'metadata',
  ],
  aiToolMessages: ['content', 'interruptAction', 'userDecision'],
  aiUsageEvents: ['rawUsageMetadata', 'rawResponseMetadata'],
  lcCheckpoints: ['checkpoint', 'metadata'],
  llmServices: ['options', 'enabledModels', 'modelOptions'],
};

/**
 * The columns each row is addressed by. `aiUsageEvents` declares no primary
 * key, but the plugin generates its `id` per row, which identifies it.
 *
 * `aiSettings` is absent on purpose: nothing in the plugin ever writes it, so
 * its only values come from the column default and were never double-encoded.
 */
const ROW_KEYS: Readonly<Record<string, readonly string[]>> = {
  aiConversations: ['sessionId'],
  aiEmployees: ['username'],
  aiFiles: ['id'],
  aiMcpClients: ['name'],
  aiMessages: ['messageId'],
  aiToolMessages: ['id'],
  aiUsageEvents: ['id'],
  lcCheckpoints: ['threadId', 'checkpointNs', 'checkpointId'],
  llmServices: ['name'],
};

type Row = Record<string, unknown>;

const migration: MigrationDefinition = defineMigration({
  name: '202609130001_normalize_double_encoded_json',
  // The unwrapped value is indistinguishable from one that was always stored
  // correctly, so re-adding the layer would also wrap rows that never had it.
  irreversible: true,
  async up({ query }: MigrationContext): Promise<void> {
    for (const [table, fields] of Object.entries(DOUBLE_ENCODED_FIELDS)) {
      const keys = ROW_KEYS[table];
      const rows = await query
        .selectFrom<Row>(table)
        .select([...keys, ...fields])
        .execute();
      for (const row of rows) {
        const changes: Row = {};
        for (const field of fields) {
          const value = row[field];
          if (typeof value !== 'string') continue;
          changes[field] = JSON.parse(value) as unknown;
        }
        if (Object.keys(changes).length === 0) continue;
        let statement = query.updateTable<Row>(table).set(changes);
        for (const key of keys) statement = statement.where(key, '=', row[key]);
        await statement.execute();
      }
    }
  },
});

export default migration;

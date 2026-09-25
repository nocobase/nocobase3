import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

// MCP tool permissions set in AI settings lived only in the running process
// and reset on every restart. They are kept on the server's own row.
const migration: MigrationDefinition = defineMigration({
  name: '202609230001_add_ai_mcp_tool_permissions',
  async up({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection('aiMcpClients', (collection) => {
      collection.json('toolPermissions', { defaultValue: {} }).notNull();
    });
  },
  async down({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection('aiMcpClients', (collection) => {
      collection.dropField('toolPermissions');
    });
  },
});

export default migration;

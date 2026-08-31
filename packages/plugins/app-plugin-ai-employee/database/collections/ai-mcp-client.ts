import type { BuilderResult, CollectionBuilder } from '@nocobase/app-database';

export function createAIMCPClientCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    'aiMcpClients',
    (c) => {
      c.string('name').notNull();
      c.string('title').nullable();
      c.string('description').nullable();
      c.boolean('enabled', { defaultValue: true }).notNull();
      c.string('transport').nullable();
      c.string('command').nullable();
      c.json('args', { defaultValue: [] }).notNull();
      c.json('env', { defaultValue: {} }).notNull();
      c.string('url').nullable();
      c.json('headers', { defaultValue: {} }).notNull();
      c.json('restart', { defaultValue: {} }).notNull();
      c.integer('sort').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('name', { name: 'pk_ai_mcp_clients' });
    },
    { ifNotExists: true, syncMetadata: false },
  );
}

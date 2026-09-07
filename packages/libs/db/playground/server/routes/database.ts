import { Hono } from 'hono';
import type { DatabaseConnection } from '@nocobase/db';
import { PlaygroundHttpError, errorCode } from '../errors.js';

export interface InspectorConnection {
  readonly connection: DatabaseConnection;
  readonly databasePath: string;
  readonly metadataStore: string;
  readonly physicalTablePrefix: string;
}

export function createDatabaseRoutes(
  connections: Readonly<Record<'main' | 'crm', InspectorConnection>>,
): Hono {
  const routes = new Hono();

  routes.get('/connections', async (context) => {
    const data = await Promise.all(
      Object.entries(connections).map(async ([name, item]) => ({
        name,
        dialect: item.connection.dialect,
        schemaManagement: item.connection.schemaManagement,
        metadataStore: item.metadataStore,
        metadataCapabilities: item.connection.collectionMetadata.capabilities,
        schemaCapabilities: item.connection.capabilities,
        databasePath: item.databasePath,
        collections: (
          await item.connection.collections.list({
            tableNamePrefixes: [item.physicalTablePrefix],
          })
        ).items,
      })),
    );
    return context.json({ data });
  });

  routes.get('/:connection/:collection', async (context) => {
    const item = resolveConnection(
      connections,
      context.req.param('connection'),
    );
    const name = context.req.param('collection');
    const summary = (
      await item.connection.collections.list({
        tableNamePrefixes: [item.physicalTablePrefix],
      })
    ).items.find((collection) => collection.name === name);
    if (!summary) {
      throw new PlaygroundHttpError(
        404,
        'COLLECTION_NOT_FOUND',
        `Collection "${name}" was not found.`,
      );
    }
    const [resolution, metadata, physicalSchema] = await Promise.all([
      item.connection.collections.getResolution(name),
      item.connection.collectionMetadata.get(name),
      item.connection.collections.getPhysical(name),
    ]);
    return context.json({
      data: {
        connection: context.req.param('connection'),
        summary,
        physicalSchema,
        metadata,
        resolution,
      },
    });
  });

  routes.post('/:connection/boundaries/schema-write', async (context) => {
    const item = resolveConnection(
      connections,
      context.req.param('connection'),
    );
    try {
      await item.connection.builder.createCollection('playgroundProbe', {
        fields: [{ name: 'id', type: 'increments', primaryKey: true }],
      });
    } catch (error) {
      return context.json({
        data: {
          rejected: true,
          code: errorCode(error),
          message: message(error),
        },
      });
    }
    await item.connection.builder.dropCollection('playgroundProbe');
    return context.json({ data: { rejected: false } });
  });

  routes.post('/:connection/boundaries/metadata-write', async (context) => {
    const connectionName = context.req.param('connection');
    const item = resolveConnection(connections, connectionName);
    try {
      await item.connection.collectionMetadata.updateCollection(
        connectionName === 'main' ? 'products' : 'customers',
        { title: 'Changed by the playground' },
      );
    } catch (error) {
      return context.json({
        data: {
          rejected: true,
          code: errorCode(error),
          message: message(error),
        },
      });
    }
    return context.json({ data: { rejected: false } });
  });

  return routes;
}

function resolveConnection(
  connections: Readonly<Record<'main' | 'crm', InspectorConnection>>,
  name: string,
): InspectorConnection {
  if (name !== 'main' && name !== 'crm') {
    throw new PlaygroundHttpError(
      404,
      'CONNECTION_NOT_FOUND',
      `Connection "${name}" was not found.`,
    );
  }
  return connections[name];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

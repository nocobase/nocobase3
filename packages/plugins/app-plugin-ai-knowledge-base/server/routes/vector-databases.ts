import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { Hono } from 'hono';

import type { VectorDatabaseService } from '../services/vector-database-service.js';
import { PG_VECTOR_PROVIDER_NAME } from '../providers/vector-database/pg-vector-provider.js';
import {
  createRouteGroup,
  body,
  data,
  error,
  ids,
  paging,
  scalar,
} from './http.js';

export function createVectorDatabaseRoutes(options: {
  readonly service: VectorDatabaseService;
}): Hono<AuthEnv> {
  const routes = createRouteGroup();

  routes.get('/aiVectorDatabases:list', async (context) =>
    data(context, await options.service.list(paging(context))),
  );
  routes.get('/aiVectorDatabases:get', async (context) => {
    const id = scalar(context, 'filterByTk');
    if (!id) return error(context, 400, 'filterByTk is required');
    const record = await options.service.get({ id });
    return record
      ? data(context, record)
      : error(context, 404, 'Vector database not found');
  });
  routes.post('/aiVectorDatabases:create', async (context) =>
    data(
      context,
      await options.service.create({ values: await body(context) }),
    ),
  );
  routes.post('/aiVectorDatabases:update', async (context) => {
    const values = await body(context);
    const id = scalar(context, 'filterByTk') ?? String(values.id ?? '');
    if (!id) return error(context, 400, 'filterByTk is required');
    const record = await options.service.update({ id, values });
    return record
      ? data(context, record)
      : error(context, 404, 'Vector database not found');
  });
  routes.post('/aiVectorDatabases:destroy', async (context) => {
    const selected = ids(context, 'filterByTk');
    if (!selected.length) return error(context, 400, 'filterByTk is required');
    await options.service.destroy({ ids: selected });
    return data(context, { success: true });
  });
  routes.get('/aiVectorDatabases:listProviders', async (context) =>
    data(context, options.service.listProviders()),
  );
  routes.get('/aiVectorDatabases:listEnabled', async (context) =>
    data(context, await options.service.findEnabled()),
  );
  routes.post('/aiVectorDatabases:testConnection', async (context) => {
    const values = await body(context);
    return data(
      context,
      await options.service.testConnection({
        provider: String(values.provider ?? PG_VECTOR_PROVIDER_NAME),
        connectProps: values.connectProps,
      }),
    );
  });
  routes.get('/aiVectorDatabases:findRelatedKnowledgeBase', async (context) =>
    data(
      context,
      await options.service.findRelatedKnowledgeBases({
        vectorDatabaseKey:
          scalar(context, 'key') ?? scalar(context, 'vectorDatabaseKey'),
      }),
    ),
  );

  return routes;
}

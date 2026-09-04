import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { Hono } from 'hono';

import type { KnowledgeBaseService } from '../services/knowledge-base-service.js';
import {
  createRouteGroup,
  body,
  data,
  error,
  ids,
  paging,
  scalar,
  userId,
} from './http.js';

export function createKnowledgeBaseRoutes(options: {
  readonly service: KnowledgeBaseService;
}): Hono<AuthEnv> {
  const routes = createRouteGroup();

  routes.get('/aiKnowledgeBase:list', async (context) =>
    data(context, await options.service.list(paging(context))),
  );
  routes.post('/aiKnowledgeBase:create', async (context) =>
    data(
      context,
      await options.service.create({
        values: await body(context),
        userId: userId(context),
      }),
    ),
  );
  routes.post('/aiKnowledgeBase:update', async (context) => {
    const values = await body(context);
    const id = scalar(context, 'filterByTk') ?? (values.id as string);
    if (!id) return error(context, 400, 'filterByTk is required');
    return data(
      context,
      await options.service.update({
        id,
        values,
        userId: userId(context),
      }),
    );
  });
  routes.post('/aiKnowledgeBase:destroy', async (context) => {
    const selected = ids(context, 'filterByTk');
    if (!selected.length) return error(context, 400, 'filterByTk is required');
    await options.service.destroy({ ids: selected, userId: userId(context) });
    return data(context, { success: true });
  });
  routes.post('/aiKnowledgeBase:runHitTest', async (context) => {
    const values = await body(context);
    if (!values.knowledgeBaseKey || !values.query) {
      return error(context, 400, 'knowledgeBaseKey and query are required');
    }
    return data(
      context,
      await options.service.hitTest({
        knowledgeBaseKey: String(values.knowledgeBaseKey),
        query: String(values.query),
        topK: Number(values.topK) || undefined,
        score: values.score === undefined ? undefined : Number(values.score),
      }),
    );
  });
  routes.post('/aiKnowledgeBase:confirmVectorStoreChanged', async (context) => {
    const key =
      scalar(context, 'key') ?? String((await body(context)).key ?? '');
    if (!key) return error(context, 400, 'key is required');
    await options.service.confirmVectorStoreChanged({ key });
    return data(context, { success: true });
  });
  routes.get('/aiKnowledgeBase:checkVectorStoreChanged', async (context) => {
    const key = scalar(context, 'key');
    if (!key) return error(context, 400, 'key is required');
    return data(
      context,
      await options.service.checkVectorStoreChanged({ key }),
    );
  });
  routes.get('/aiKnowledgeBase:listStorageDisks', async (context) =>
    data(context, options.service.listStorageDisks()),
  );
  routes.get(
    '/aiKnowledgeBase:listExternalVectorStoreProviders',
    async (context) =>
      data(context, options.service.listExternalVectorStoreProviders()),
  );

  return routes;
}

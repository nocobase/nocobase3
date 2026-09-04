import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { Hono } from 'hono';

import type { KnowledgeBaseDocumentService } from '../services/knowledge-base-document-service.js';
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

export function createDocumentRoutes(options: {
  readonly service: KnowledgeBaseDocumentService;
}): Hono<AuthEnv> {
  const routes = createRouteGroup();

  routes.get('/aiKnowledgeBaseDocs:list', async (context) =>
    data(
      context,
      await options.service.list({
        ...paging(context),
        knowledgeBaseKey: scalar(context, 'filter[knowledgeBaseKey]'),
      }),
    ),
  );
  routes.get('/aiKnowledgeBaseDocs:get', async (context) => {
    const id = scalar(context, 'filterByTk');
    if (!id) return error(context, 400, 'filterByTk is required');
    const record = await options.service.get({ id });
    return record
      ? data(context, record)
      : error(context, 404, 'Document not found');
  });
  routes.post('/aiKnowledgeBaseDocs:upload', async (context) => {
    const queryKey = scalar(context, 'knowledgeBaseKey') ?? '';
    const contentType = context.req.header('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const form = await context.req.formData();
      const file = form.get('file');
      const knowledgeBaseKey =
        queryKey || String(form.get('knowledgeBaseKey') ?? '');
      if (!(file instanceof File) || !knowledgeBaseKey) {
        return error(context, 400, 'knowledgeBaseKey and file are required');
      }
      return data(
        context,
        await options.service.upload({
          knowledgeBaseKey,
          file: {
            name: file.name,
            type: file.type,
            bytes: new Uint8Array(await file.arrayBuffer()),
          },
          userId: userId(context),
        }),
      );
    }
    const values = await body(context);
    const knowledgeBaseKey = queryKey || String(values.knowledgeBaseKey ?? '');
    if (!knowledgeBaseKey)
      return error(context, 400, 'knowledgeBaseKey is required');
    return data(
      context,
      await options.service.finalizeUpload({
        knowledgeBaseKey,
        values,
        userId: userId(context),
      }),
    );
  });
  routes.post('/aiKnowledgeBaseDocs:destroy', async (context) => {
    const selected = ids(context, 'filterByTk');
    if (!selected.length) return error(context, 400, 'filterByTk is required');
    await options.service.destroy({ ids: selected });
    return data(context, { success: true });
  });
  routes.post('/aiKnowledgeBaseDocs:vectorization', async (context) => {
    const count = await options.service.queueVectorization({
      knowledgeBaseKey: scalar(context, 'knowledgeBaseKey'),
      ids: ids(context, 'id'),
    });
    return data(context, { queued: count });
  });
  routes.get('/aiKnowledgeBaseDocs:getUploadStorage', async (context) => {
    const knowledgeBaseKey = scalar(context, 'knowledgeBaseKey');
    if (!knowledgeBaseKey)
      return error(context, 400, 'knowledgeBaseKey is required');
    const storage = await options.service.getUploadStorage({
      knowledgeBaseKey,
    });
    return storage
      ? data(context, storage)
      : error(context, 404, 'Knowledge base not found');
  });
  routes.get(
    '/aiKnowledgeBaseDocs:getZipFilenameEncodingOptions',
    async (context) =>
      data(context, options.service.getZipFilenameEncodingOptions()),
  );

  return routes;
}

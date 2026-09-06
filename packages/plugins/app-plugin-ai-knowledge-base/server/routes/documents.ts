import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { Hono } from 'hono';

import {
  assertKnowledgeBaseDocumentUploadSize,
  type KnowledgeBaseDocumentUploadFile,
  KnowledgeBaseUploadError,
} from '../document-upload.js';
import type { KnowledgeBaseDocumentService } from '../services/knowledge-base-document-service.js';
import {
  createRouteGroup,
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
    const contentType = context.req.header('content-type') ?? '';
    if (!isMultipartFormData(contentType)) {
      throw new KnowledgeBaseUploadError(
        'UNSUPPORTED_UPLOAD_CONTENT_TYPE',
        'Document upload requires multipart/form-data.',
        415,
      );
    }

    let form: FormData;
    try {
      form = await context.req.formData();
    } catch (cause) {
      throw new KnowledgeBaseUploadError(
        'UPLOAD_INPUT_INVALID',
        'A valid multipart upload body is required.',
        400,
        { cause },
      );
    }

    const fileEntries: Array<readonly [string, unknown]> = [];
    for (const [name, value] of form.entries()) {
      if (isUploadFile(value)) fileEntries.push([name, value]);
    }
    const fileEntry = fileEntries.length === 1 ? fileEntries[0] : undefined;
    const file = fileEntry?.[0] === 'file' ? fileEntry[1] : undefined;
    const queryKey = scalar(context, 'knowledgeBaseKey')?.trim();
    const formValue = form.get('knowledgeBaseKey');
    const formKey = typeof formValue === 'string' ? formValue.trim() : '';
    const knowledgeBaseKey = queryKey || formKey;
    if (!isUploadFile(file) || !knowledgeBaseKey) {
      throw new KnowledgeBaseUploadError(
        'UPLOAD_INPUT_INVALID',
        'knowledgeBaseKey and file are required.',
        400,
      );
    }
    assertKnowledgeBaseDocumentUploadSize(file.size);

    return data(
      context,
      await options.service.upload({
        knowledgeBaseKey,
        file,
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
  return routes;
}

function isMultipartFormData(contentType: string): boolean {
  const [mediaType] = contentType.split(';', 1);
  if (mediaType?.trim().toLowerCase() !== 'multipart/form-data') return false;
  const boundary = contentType.match(
    /(?:^|;)\s*boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/iu,
  );
  return Boolean(boundary?.[1] ?? boundary?.[2]);
}

function isUploadFile(
  value: unknown,
): value is File & KnowledgeBaseDocumentUploadFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<KnowledgeBaseDocumentUploadFile>;
  return (
    typeof candidate.name === 'string' &&
    Number.isSafeInteger(candidate.size) &&
    candidate.size !== undefined &&
    candidate.size >= 0 &&
    typeof candidate.arrayBuffer === 'function'
  );
}

import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { Hono } from 'hono';

import type { SegmentQuestion } from '../internal-types.js';
import type { KnowledgeBaseSegmentService } from '../services/knowledge-base-segment-service.js';
import {
  createRouteGroup,
  body,
  data,
  error,
  paging,
  scalar,
  userId,
} from './http.js';

export function createSegmentRoutes(options: {
  readonly service: KnowledgeBaseSegmentService;
}): Hono<AuthEnv> {
  const routes = createRouteGroup();

  routes.get('/aiKnowledgeBaseDocSegments:list', async (context) => {
    const documentId = scalar(context, 'knowledgeBaseDocsId');
    if (!documentId)
      return error(context, 400, 'knowledgeBaseDocsId is required');
    return data(
      context,
      await options.service.list({
        ...paging(context),
        documentId,
      }),
    );
  });
  routes.get('/aiKnowledgeBaseDocSegments:getSegment', async (context) => {
    const documentId = scalar(context, 'knowledgeBaseDocsId');
    const segmentUid = scalar(context, 'segmentUid');
    if (!documentId || !segmentUid) {
      return error(
        context,
        400,
        'knowledgeBaseDocsId and segmentUid are required',
      );
    }
    const segment = await options.service.get({ documentId, segmentUid });
    return segment
      ? data(context, segment)
      : error(context, 404, 'Segment not found');
  });
  routes.post('/aiKnowledgeBaseDocSegments:updateSegment', async (context) => {
    const values = await body(context);
    return data(
      context,
      await options.service.update({
        documentId: values.knowledgeBaseDocsId as string,
        segmentUid: String(values.segmentUid),
        expectedContentHash: String(values.contentHash ?? ''),
        title: values.title as string,
        content: String(values.content ?? ''),
        userId: userId(context),
      }),
    );
  });
  routes.post(
    '/aiKnowledgeBaseDocSegments:updateQuestions',
    async (context) => {
      const values = await body(context);
      return data(
        context,
        await options.service.update({
          documentId: values.knowledgeBaseDocsId as string,
          segmentUid: String(values.segmentUid),
          expectedContentHash: String(values.contentHash ?? ''),
          questions: (values.questions ?? []) as SegmentQuestion[],
          userId: userId(context),
        }),
      );
    },
  );
  routes.post('/aiKnowledgeBaseDocSegments:setEnabled', async (context) => {
    const values = await body(context);
    const segment = await options.service.setEnabled({
      documentId: values.knowledgeBaseDocsId as string,
      segmentUid: String(values.segmentUid),
      enabled: values.enabled !== false,
    });
    return segment
      ? data(context, segment)
      : error(context, 404, 'Segment not found');
  });
  routes.post('/aiKnowledgeBaseDocSegments:deleteSegment', async (context) => {
    const values = await body(context);
    const deleted = await options.service.delete({
      documentId: values.knowledgeBaseDocsId as string,
      segmentUid: String(values.segmentUid),
    });
    return deleted
      ? data(context, { success: true })
      : error(context, 404, 'Segment not found');
  });
  routes.post('/aiKnowledgeBaseDocSegments:regenerate', async (context) => {
    const values = await body(context);
    await options.service.regenerate({
      documentId: values.knowledgeBaseDocsId as string,
      ...(values.segmentOptions && typeof values.segmentOptions === 'object'
        ? { segmentOptions: values.segmentOptions as Record<string, unknown> }
        : {}),
    });
    return data(context, { success: true });
  });

  return routes;
}

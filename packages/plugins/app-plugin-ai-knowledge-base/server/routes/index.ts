import type { AIManager } from '@nocobase/ai-employee';
import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import { Hono, type Context } from 'hono';
import { nanoid } from 'nanoid';
import { createHash } from 'node:crypto';
import type { KnowledgeBaseService } from '../service.js';
import type {
  JsonRecord,
  KnowledgeBasePluginDeps,
  SegmentQuestion,
} from '../types.js';
import { PG_VECTOR_PROVIDER_NAME } from '../vector.js';

type RoutesContext = AppPluginRoutesContext<KnowledgeBasePluginDeps, unknown>;
const data = (context: Context, value: unknown, status = 200): Response =>
  context.json({ data: value }, status as 200);
const error = (context: Context, status: number, message: string): Response =>
  context.json({ errors: [{ message }] }, status as 400);
const body = async (context: Context): Promise<JsonRecord> => {
  const type = context.req.header('content-type') ?? '';
  if (type.includes('application/json'))
    return await context.req.json<JsonRecord>();
  return {};
};
const ids = (context: Context, name: string): Array<string | number> => {
  const url = new URL(context.req.url);
  const values = url.searchParams
    .getAll(name)
    .concat(url.searchParams.getAll(`${name}[]`));
  return values.flatMap((value) => value.split(',')).filter(Boolean);
};
const scalar = (context: Context, name: string): string | undefined =>
  new URL(context.req.url).searchParams.get(name) ?? undefined;
const paging = (
  context: Context,
): { page: number; pageSize: number; paginate: boolean } => ({
  page: Math.max(1, Number(scalar(context, 'page')) || 1),
  pageSize: Math.min(
    200,
    Math.max(1, Number(scalar(context, 'pageSize')) || 20),
  ),
  paginate: scalar(context, 'paginate') !== 'false',
});
const paged = async <T extends Record<string, unknown>>(
  context: Context,
  repo: {
    find(options: {
      filter?: JsonRecord;
      sort?: string[];
      limit?: number;
      offset?: number;
    }): Promise<T[]>;
    count(filter?: JsonRecord): Promise<number>;
  },
  filter: JsonRecord = {},
  transform?: (row: T) => Record<string, unknown>,
): Promise<Response> => {
  const { page, pageSize, paginate } = paging(context);
  const rows = await repo.find({
    filter,
    sort: ['-createdAt'],
    ...(paginate ? { limit: pageSize, offset: (page - 1) * pageSize } : {}),
  });
  const count = await repo.count(filter);
  return data(context, {
    data: transform ? rows.map(transform) : rows,
    meta: { count, page, pageSize },
  });
};

export default function registerRoutes(
  context: RoutesContext,
  mountLegacy: boolean = true,
): Hono {
  const { app, deps } = context;
  const service = (
    deps.ai as AIManager & { __knowledgeBaseService?: KnowledgeBaseService }
  ).__knowledgeBaseService;
  if (!service)
    throw new Error(
      'Knowledge base plugin bootstrap did not initialize its service',
    );
  const routes = new Hono();
  const guard =
    (handler: (context: Context) => Promise<Response>) =>
    async (context: Context): Promise<Response> => {
      try {
        return await handler(context);
      } catch (cause) {
        const status =
          Number((cause as { status?: number }).status) ||
          (/not found/i.test(String((cause as Error).message)) ? 404 : 500);
        return error(
          context,
          status,
          cause instanceof Error ? cause.message : String(cause),
        );
      }
    };

  routes.get(
    '/aiKnowledgeBase:list',
    guard(async (c) => {
      const { page, pageSize, paginate } = paging(c);
      const rows = await service.bases.find({
        sort: ['-createdAt'],
        ...(paginate ? { limit: pageSize, offset: (page - 1) * pageSize } : {}),
      });
      const enriched = await Promise.all(
        rows.map(async (row) => {
          const config = row.vectorStoreConfigKey
            ? await service.vectorConfigs.findOne({
                key: row.vectorStoreConfigKey,
              })
            : undefined;
          return {
            ...row,
            ...(config
              ? {
                  vectorDatabaseKey: config.vectorDatabaseKey,
                  llmService: config.llmService,
                  embeddingModel: config.embeddingModel,
                }
              : {}),
          };
        }),
      );
      return data(c, {
        data: enriched,
        meta: { count: await service.bases.count(), page, pageSize },
      });
    }),
  );
  routes.post(
    '/aiKnowledgeBase:create',
    guard(async (c) =>
      data(c, await service.createKnowledgeBase(await body(c))),
    ),
  );
  routes.post(
    '/aiKnowledgeBase:update',
    guard(async (c) => {
      const values = await body(c);
      const id = scalar(c, 'filterByTk') ?? (values.id as string);
      if (!id) return error(c, 400, 'filterByTk is required');
      const updated = await service.updateKnowledgeBase(id, values);
      return data(c, updated);
    }),
  );
  routes.post(
    '/aiKnowledgeBase:destroy',
    guard(async (c) => {
      const selected = ids(c, 'filterByTk');
      if (!selected.length) return error(c, 400, 'filterByTk is required');
      const rows = await service.bases.find({
        filter: { id: { $in: selected } },
      });
      for (const row of rows) {
        const docs = await service.docs.find({
          filter: { knowledgeBaseKey: row.key },
        });
        await service.deleteDocuments(docs.map((item) => item.id));
      }
      await service.bases.destroy({ id: { $in: selected } });
      return data(c, { success: true });
    }),
  );
  routes.post(
    '/aiKnowledgeBase:runHitTest',
    guard(async (c) => {
      const values = await body(c);
      if (!values.knowledgeBaseKey || !values.query)
        return error(c, 400, 'knowledgeBaseKey and query are required');
      return data(
        c,
        await service.hitTest(
          String(values.knowledgeBaseKey),
          String(values.query),
          Number(values.topK) || undefined,
          values.score === undefined ? undefined : Number(values.score),
        ),
      );
    }),
  );
  routes.post(
    '/aiKnowledgeBase:confirmVectorStoreChanged',
    guard(async (c) => {
      const key = scalar(c, 'key') ?? String((await body(c)).key ?? '');
      if (!key) return error(c, 400, 'key is required');
      await service.bases.update(
        { key },
        { confirmVectorStoreChanged: new Date() },
      );
      return data(c, { success: true });
    }),
  );
  routes.get(
    '/aiKnowledgeBase:checkVectorStoreChanged',
    guard(async (c) => {
      const key = scalar(c, 'key');
      if (!key) return error(c, 400, 'key is required');
      const base = await service.bases.findOne({ key });
      return data(
        c,
        base
          ? {
              key,
              changed: false,
              confirmVectorStoreChanged: base.confirmVectorStoreChanged,
            }
          : null,
      );
    }),
  );
  routes.get(
    '/aiKnowledgeBase:listExternalVectorStoreProviders',
    guard(async (c) =>
      data(
        c,
        deps.ai.features.vectorStoreProvider.providerNames.filter(
          (name) =>
            ![
              'NocobaseLocalVectorStoreProvider',
              'NocobaseReadonlyVectorStoreProvider',
            ].includes(name),
        ),
      ),
    ),
  );

  routes.get(
    '/aiKnowledgeBaseDocs:list',
    guard(async (c) =>
      paged(
        c,
        service.docs,
        scalar(c, 'filter[knowledgeBaseKey]')
          ? { knowledgeBaseKey: scalar(c, 'filter[knowledgeBaseKey]')! }
          : {},
        (record) => ({ ...record, accessAbility: 'readWrite' }),
      ),
    ),
  );
  routes.get(
    '/aiKnowledgeBaseDocs:get',
    guard(async (c) => {
      const id = scalar(c, 'filterByTk');
      if (!id) return error(c, 400, 'filterByTk is required');
      const record = await service.docs.findById(id);
      return record
        ? data(c, { ...record, accessAbility: 'readWrite' })
        : error(c, 404, 'Document not found');
    }),
  );
  routes.post(
    '/aiKnowledgeBaseDocs:upload',
    guard(async (c) => {
      const key = scalar(c, 'knowledgeBaseKey') ?? '';
      const type = c.req.header('content-type') ?? '';
      if (type.includes('multipart/form-data')) {
        const form = await c.req.formData();
        const file = form.get('file');
        const kb = key || String(form.get('knowledgeBaseKey') ?? '');
        if (!(file instanceof File) || !kb)
          return error(c, 400, 'knowledgeBaseKey and file are required');
        return data(
          c,
          await service.upload(kb, {
            name: file.name,
            type: file.type,
            bytes: new Uint8Array(await file.arrayBuffer()),
          }),
        );
      }
      const values = await body(c);
      const kb = key || String(values.knowledgeBaseKey ?? '');
      if (!kb) return error(c, 400, 'knowledgeBaseKey is required');
      return data(c, await service.finalizeUpload(kb, values));
    }),
  );
  routes.post(
    '/aiKnowledgeBaseDocs:destroy',
    guard(async (c) => {
      const selected = ids(c, 'filterByTk');
      if (!selected.length) return error(c, 400, 'filterByTk is required');
      const records = await service.docs.find({
        filter: { id: { $in: selected } },
      });
      await service.deleteDocuments(selected);
      for (const key of new Set(records.map((item) => item.knowledgeBaseKey)))
        await service.refreshStatistics(key);
      return data(c, { success: true });
    }),
  );
  routes.post(
    '/aiKnowledgeBaseDocs:vectorization',
    guard(async (c) => {
      const key = scalar(c, 'knowledgeBaseKey');
      const selected = ids(c, 'id');
      const records = await service.docs.find({
        filter: {
          ...(key ? { knowledgeBaseKey: key } : {}),
          ...(selected.length ? { id: { $in: selected } } : {}),
        },
      });
      for (const record of records)
        await service.dispatchVectorization(record.id);
      return data(c, { queued: records.length });
    }),
  );
  routes.get(
    '/aiKnowledgeBaseDocs:getUploadStorage',
    guard(async (c) => {
      const key = scalar(c, 'knowledgeBaseKey');
      if (!key) return error(c, 400, 'knowledgeBaseKey is required');
      const base = await service.bases.findOne({ key });
      if (!base) return error(c, 404, 'Knowledge base not found');
      return data(c, {
        id: base.storageId ?? 'default',
        name: 'default',
        title: 'Default storage',
        type: 'local',
        rules: { size: 100 * 1024 * 1024 },
      });
    }),
  );
  routes.get(
    '/aiKnowledgeBaseDocs:getZipFilenameEncodingOptions',
    guard(async (c) =>
      data(c, {
        options: [
          { value: 'utf8', label: 'UTF-8', isDefault: true },
          { value: 'gbk', label: 'GBK' },
        ],
      }),
    ),
  );

  routes.get(
    '/aiKnowledgeBaseDocSegments:list',
    guard(async (c) => {
      const id = scalar(c, 'knowledgeBaseDocsId');
      if (!id) return error(c, 400, 'knowledgeBaseDocsId is required');
      return paged(c, service.segments, { knowledgeBaseDocsId: id });
    }),
  );
  routes.get(
    '/aiKnowledgeBaseDocSegments:getSegment',
    guard(async (c) => {
      const id = scalar(c, 'knowledgeBaseDocsId');
      const uid = scalar(c, 'segmentUid');
      if (!id || !uid)
        return error(c, 400, 'knowledgeBaseDocsId and segmentUid are required');
      const value = await service.listSegmentContent(id, uid);
      return value ? data(c, value) : error(c, 404, 'Segment not found');
    }),
  );
  routes.post(
    '/aiKnowledgeBaseDocSegments:updateSegment',
    guard(async (c) => {
      const values = await body(c);
      return data(
        c,
        await service.updateSegment(
          values.knowledgeBaseDocsId as string,
          String(values.segmentUid),
          {
            title: values.title as string,
            content: String(values.content ?? ''),
            contentHash: String(values.contentHash ?? ''),
          },
        ),
      );
    }),
  );
  routes.post(
    '/aiKnowledgeBaseDocSegments:updateQuestions',
    guard(async (c) => {
      const values = await body(c);
      return data(
        c,
        await service.updateSegment(
          values.knowledgeBaseDocsId as string,
          String(values.segmentUid),
          {
            questions: (values.questions ?? []) as SegmentQuestion[],
            contentHash: String(values.contentHash ?? ''),
          },
        ),
      );
    }),
  );
  routes.post(
    '/aiKnowledgeBaseDocSegments:setEnabled',
    guard(async (c) => {
      const values = await body(c);
      const segment = await service.segments.findOne({
        knowledgeBaseDocsId: values.knowledgeBaseDocsId,
        uid: values.segmentUid,
      });
      if (!segment) return error(c, 404, 'Segment not found');
      await service.segments.update(
        { id: segment.id },
        { enabled: values.enabled !== false },
      );
      await service.dispatchVectorization(
        segment.knowledgeBaseDocsId,
        undefined,
        true,
      );
      return data(
        c,
        await service.listSegmentContent(
          segment.knowledgeBaseDocsId,
          segment.uid,
        ),
      );
    }),
  );
  routes.post(
    '/aiKnowledgeBaseDocSegments:deleteSegment',
    guard(async (c) => {
      const values = await body(c);
      const segment = await service.segments.findOne({
        knowledgeBaseDocsId: values.knowledgeBaseDocsId,
        uid: values.segmentUid,
      });
      if (!segment) return error(c, 404, 'Segment not found');
      await service.segments.destroy({ id: segment.id });
      await service.dispatchVectorization(
        segment.knowledgeBaseDocsId,
        undefined,
        true,
      );
      return data(c, { success: true });
    }),
  );
  routes.post(
    '/aiKnowledgeBaseDocSegments:regenerate',
    guard(async (c) => {
      const values = await body(c);
      if (values.segmentOptions)
        await service.docs.update(
          { id: values.knowledgeBaseDocsId },
          {
            segmentOptions: (
              await import('../service.js')
            ).normalizeSegmentOptions(values.segmentOptions),
          },
        );
      await service.dispatchVectorization(values.knowledgeBaseDocsId as string);
      return data(c, { success: true });
    }),
  );

  routes.get(
    '/aiVectorDatabases:list',
    guard(async (c) => paged(c, service.vectors)),
  );
  routes.get(
    '/aiVectorDatabases:get',
    guard(async (c) => {
      const id = scalar(c, 'filterByTk');
      if (!id) return error(c, 400, 'filterByTk is required');
      const value = await service.vectors.findById(id);
      return value
        ? data(c, value)
        : error(c, 404, 'Vector database not found');
    }),
  );
  routes.post(
    '/aiVectorDatabases:create',
    guard(async (c) => {
      const values = await body(c);
      const provider = String(values.provider ?? PG_VECTOR_PROVIDER_NAME);
      const connectProps = values.connectProps as JsonRecord;
      const check = await deps.ai.features.vectorDatabaseProvider.beforeCreate(
        provider,
        connectProps,
        { skipTableExistedCheck: values.skipTableExistedCheck === true },
      );
      if (check.status)
        return error(c, 409, check.message ?? 'TABLE_ALREADY_EXISTS');
      const value = await service.vectors.create({
        ...values,
        key: String(values.key ?? nanoid(32)),
        provider,
        databaseSpec: String(values.databaseSpec ?? 'PGVector'),
        connectProps,
        connectPropsHash: createHash('sha256')
          .update(JSON.stringify(connectProps))
          .digest('hex'),
        enabled: values.enabled !== false,
      });
      return data(c, value);
    }),
  );
  routes.post(
    '/aiVectorDatabases:update',
    guard(async (c) => {
      const values = await body(c);
      const id = scalar(c, 'filterByTk') ?? String(values.id ?? '');
      if (!id) return error(c, 400, 'filterByTk is required');
      const existing = await service.vectors.findById(id);
      if (!existing) return error(c, 404, 'Vector database not found');
      const provider = String(values.provider ?? existing.provider);
      const connectProps = (values.connectProps ??
        existing.connectProps) as JsonRecord;
      deps.ai.features.vectorDatabaseProvider.validateConnectParams(
        provider,
        connectProps,
      );
      await service.vectors.update(
        { id },
        {
          ...values,
          provider,
          connectProps,
          connectPropsHash: createHash('sha256')
            .update(JSON.stringify(connectProps))
            .digest('hex'),
        },
      );
      return data(c, await service.vectors.findById(id));
    }),
  );
  routes.post(
    '/aiVectorDatabases:destroy',
    guard(async (c) => {
      const selected = ids(c, 'filterByTk');
      if (!selected.length) return error(c, 400, 'filterByTk is required');
      const related = await Promise.all(
        selected.map(async (id) => {
          const db = await service.vectors.findById(id);
          return db
            ? service.bases.find({ filter: { vectorStoreConfigKey: db.key } })
            : [];
        }),
      );
      if (related.some((rows) => rows.length))
        return error(c, 409, 'Vector database is used by a knowledge base');
      await service.vectors.destroy({ id: { $in: selected } });
      return data(c, { success: true });
    }),
  );
  routes.get(
    '/aiVectorDatabases:listProviders',
    guard(async (c) =>
      data(
        c,
        deps.ai.features.vectorDatabaseProvider
          .listProviders()
          .map(({ name, spec }) => ({ name, spec })),
      ),
    ),
  );
  routes.get(
    '/aiVectorDatabases:listEnabled',
    guard(async (c) =>
      data(
        c,
        await service.vectors.find({
          filter: { enabled: true },
          sort: ['name'],
        }),
      ),
    ),
  );
  routes.post(
    '/aiVectorDatabases:testConnection',
    guard(async (c) => {
      const values = await body(c);
      return data(
        c,
        await deps.ai.features.vectorDatabaseProvider.testConnection(
          String(values.provider ?? PG_VECTOR_PROVIDER_NAME),
          values.connectProps,
        ),
      );
    }),
  );
  routes.get(
    '/aiVectorDatabases:findRelatedKnowledgeBase',
    guard(async (c) => {
      const key = scalar(c, 'key') ?? scalar(c, 'vectorDatabaseKey');
      return data(
        c,
        key
          ? await service.bases.find({ filter: { vectorStoreConfigKey: key } })
          : [],
      );
    }),
  );
  if (mountLegacy) app.route('/v2/api', routes);
  return routes;
}

import { Readable } from 'node:stream';
import {
  defineApiRoutes,
  defineRootRoutes,
  defineRepositoryApiRoutes,
  type AppRouteContribution,
  type RepositoryApiActions,
} from '@nocobase/app-server/router';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  addBasePathToLocation,
  joinBasePath,
} from '@nocobase/app-server/support';
import type { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import {
  FileRepositoryError,
  normalizeAccessPath,
  normalizeFileRecord,
  validMime,
  type ServerFileRepository,
} from './repository.js';
import { serverFileRepositoryManagerToken } from './token.js';

export interface FileRepositoryApiActions extends RepositoryApiActions {
  readonly uploadOne?: { readonly maxSize?: number };
  readonly uploadMany?: { readonly maxSize?: number };
}
export interface FileRepositoryApiExposure {
  readonly name: string;
  readonly collection?: string;
  readonly connection?: string;
  readonly disk: string;
  readonly accessPath?: string;
  readonly accessMode?: 'stream' | 'redirect';
  readonly actions: FileRepositoryApiActions;
}
export interface FileRepositoryRoutesApplication {
  readonly container: ServiceContainer;
  readonly publicBasePath?: string;
}
export interface DefineFileRepositoryApiRoutesOptions {
  readonly repositories: readonly FileRepositoryApiExposure[];
}

/** Public first-version routes. Authentication and authorization are application-owned. */
export function defineFileRepositoryApiRoutes(
  options: DefineFileRepositoryApiRoutesOptions,
): readonly AppRouteContribution<FileRepositoryRoutesApplication>[] {
  const paths: string[] = [];
  const entries = options.repositories.map((entry) => {
    const accessPath = normalizeAccessPath(
      entry.accessPath ?? `/uploads/${entry.name}`,
    );
    if (
      paths.some(
        (path) =>
          path === accessPath ||
          path.startsWith(`${accessPath}/`) ||
          accessPath.startsWith(`${path}/`),
      )
    )
      throw new Error(`Conflicting file accessPath: ${accessPath}`);
    paths.push(accessPath);
    if (!entry.disk) throw new Error('File repository disk is required.');
    if (
      entry.accessMode !== undefined &&
      !['stream', 'redirect'].includes(entry.accessMode)
    )
      throw new Error('Invalid file accessMode.');
    const { uploadOne, uploadMany, ...actions } = entry.actions;
    for (const upload of [uploadOne, uploadMany]) {
      if (upload === undefined) continue;
      if (
        !upload ||
        typeof upload !== 'object' ||
        Object.keys(upload).some((key) => key !== 'maxSize')
      )
        throw new Error('Invalid upload action configuration.');
      if (
        upload.maxSize !== undefined &&
        (!Number.isSafeInteger(upload.maxSize) || upload.maxSize <= 0)
      )
        throw new Error('maxSize must be a positive safe integer.');
    }
    return { ...entry, accessPath, actions, uploadOne, uploadMany };
  });
  const crud = defineRepositoryApiRoutes({
    repositories: entries.map(({ name, collection, connection, actions }) => ({
      name,
      collection,
      connection,
      actions,
    })),
  });
  const resolve = (
    app: FileRepositoryRoutesApplication,
    entry: (typeof entries)[number],
  ): ServerFileRepository =>
    app.container
      .resolve(serverFileRepositoryManagerToken)
      .repository(entry.collection ?? entry.name, {
        connection: entry.connection,
        disk: entry.disk,
        accessPath: entry.accessPath,
      });
  const urlFor =
    (app: FileRepositoryRoutesApplication, files: ServerFileRepository) =>
    (record: { id: string; ext: string }): string =>
      `${(app.publicBasePath ?? '').replace(/\/$/, '')}${files.getUrl(record)}`;
  return [
    defineApiRoutes(async (app: FileRepositoryRoutesApplication) => {
      const router = fileRouter();
      for (const entry of entries) {
        const files = resolve(app, entry);
        const getUrl = urlFor(app, files);
        for (const action of Object.keys(entry.actions)) {
          router.use(
            `/${encodeURIComponent(entry.name)}:${action}`,
            async (c, next) => {
              await files.validateCollection();
              await next();
              if (
                !c.res.ok ||
                ![
                  'findMany',
                  'findOne',
                  'createOne',
                  'updateOne',
                  'deleteOne',
                ].includes(action)
              )
                return;
              if (
                c.res.headers
                  .get('content-type')
                  ?.includes('application/x-ndjson') &&
                c.res.body
              ) {
                c.res = new Response(decorateStream(c.res.body, getUrl), {
                  status: c.res.status,
                  headers: c.res.headers,
                });
              } else {
                const envelope = (await c.res.json()) as { data: unknown };
                c.res = Response.json(
                  {
                    ...envelope,
                    data: decorate(
                      envelope.data,
                      getUrl,
                      action !== 'findOne' && action !== 'findMany',
                    ),
                  },
                  { status: c.res.status, headers: c.res.headers },
                );
              }
            },
          );
        }
        for (const action of ['uploadOne', 'uploadMany'] as const) {
          const config = entry[action];
          if (config === undefined) continue;
          router.post(
            `/${encodeURIComponent(entry.name)}:${action}`,
            bodyLimit({
              maxSize:
                config.maxSize ??
                (action === 'uploadOne' ? 5 : 20) * 1024 * 1024,
              onError: (c) =>
                c.json(
                  {
                    code: 'BODY_TOO_LARGE',
                    message: 'Upload request body is too large.',
                  },
                  413,
                ),
            }),
            async (c) => {
              if (
                !c.req
                  .header('content-type')
                  ?.toLowerCase()
                  .startsWith('multipart/form-data;')
              )
                return c.json(
                  {
                    code: 'UNSUPPORTED_MEDIA_TYPE',
                    message: 'Expected multipart/form-data.',
                  },
                  415,
                );
              let body: Awaited<ReturnType<typeof c.req.parseBody>>;
              try {
                body = await c.req.parseBody({ all: true });
              } catch {
                return c.json(
                  {
                    code: 'INVALID_MULTIPART',
                    message: 'Invalid multipart body.',
                  },
                  400,
                );
              }
              const value = body.file;
              if (action === 'uploadOne') {
                if (!(value instanceof File))
                  return c.json(
                    {
                      code: 'INVALID_FILE',
                      message: 'Exactly one File is required.',
                    },
                    400,
                  );
                return c.json({
                  data: decorate(
                    await files.uploadOne({ file: value }),
                    getUrl,
                    true,
                  ),
                });
              }
              const uploads = Array.isArray(value)
                ? value
                : value === undefined
                  ? []
                  : [value];
              if (
                !uploads.length ||
                !uploads.every((file): file is File => file instanceof File)
              )
                return c.json(
                  {
                    code: 'INVALID_FILES',
                    message: 'At least one File is required.',
                  },
                  400,
                );
              return c.json({
                data: decorate(
                  await files.uploadMany({ files: uploads as File[] }),
                  getUrl,
                  true,
                ),
              });
            },
          );
        }
      }
      router.route('/', await crud.createRouter(app));
      return router;
    }),
    defineRootRoutes((app: FileRepositoryRoutesApplication) => {
      const router = fileRouter();
      for (const entry of entries) {
        const files = resolve(app, entry);
        router.get(`${entry.accessPath}/:file`, async (c) => {
          const match =
            /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([a-z0-9]{1,32}))?$/.exec(
              c.req.param('file'),
            );
          if (!match) return c.notFound();
          const record = await files.findOne({ filter: { id: match[1] } });
          if (!record || record.ext !== (match[2] ?? '')) return c.notFound();
          const disk = app.container
            .resolve(driveManagerToken)
            .use(record.disk);
          if (!(await disk.exists(record.key))) return c.notFound();
          c.header('Cache-Control', 'private, no-store');
          if (entry.accessMode === 'redirect') {
            const url = await files.getStorageUrl(record);
            const publicBasePath = app.publicBasePath ?? '';
            // Check the final target after the host rewrites root-relative redirects.
            const location = new URL(
              addBasePathToLocation(url, publicBasePath),
              c.req.url,
            );
            if (
              location.origin === new URL(c.req.url).origin &&
              entries.some((item) =>
                location.pathname.startsWith(
                  `${joinBasePath(publicBasePath, item.accessPath)}/`,
                ),
              )
            )
              throw new FileRepositoryError(
                'STORAGE_URL_UNAVAILABLE',
                'Storage URL points back to a file access route.',
              );
            return c.redirect(url, 302);
          }
          c.header('Content-Type', validMime(record.mimeType));
          c.header('Content-Length', String(record.size));
          c.header('X-Content-Type-Options', 'nosniff');
          c.header('Content-Security-Policy', "sandbox; default-src 'none'");
          c.header(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(Buffer.from(record.filename).toString('utf8')).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
          );
          return c.body(
            Readable.toWeb(
              await disk.getStream(record.key),
            ) as ReadableStream<Uint8Array>,
          );
        });
      }
      return router;
    }),
  ];
}

function fileRouter(): Hono {
  const router = new Hono();
  router.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    if (error instanceof FileRepositoryError)
      return c.json(
        { code: error.code, message: error.message },
        ['INVALID_FILE', 'INVALID_FILES'].includes(error.code) ? 400 : 500,
      );
    throw error;
  });
  return router;
}

type UrlBuilder = (record: { id: string; ext: string }) => string;
function decorate(
  value: unknown,
  getUrl: UrlBuilder,
  mutationResult: boolean = false,
): unknown {
  if (Array.isArray(value))
    return value.map((record) => decorate(record, getUrl));
  if (!value || typeof value !== 'object') return value;
  // Only mutation responses wrap records; collections may use these field names.
  if (mutationResult && 'record' in value)
    return { ...value, record: decorate(value.record, getUrl) };
  if (mutationResult && 'records' in value)
    return { ...value, records: decorate(value.records, getUrl) };
  const record = normalizeFileRecord(value as Record<string, unknown>);
  if (typeof record.id === 'string' && typeof record.ext === 'string')
    return {
      ...record,
      contentUrl: getUrl({ id: record.id, ext: record.ext }),
    };
  return record;
}
function decorateStream(
  body: ReadableStream<Uint8Array>,
  getUrl: UrlBuilder,
): ReadableStream<Uint8Array> {
  let pending = '';
  const decoder = new TextDecoder();
  return body
    .pipeThrough(
      new TransformStream<Uint8Array, string>({
        transform(chunk, controller) {
          controller.enqueue(decoder.decode(chunk, { stream: true }));
        },
        flush(controller) {
          controller.enqueue(decoder.decode());
        },
      }),
    )
    .pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, controller) {
          pending += chunk;
          let newline: number;
          while ((newline = pending.indexOf('\n')) !== -1) {
            const line = pending.slice(0, newline);
            pending = pending.slice(newline + 1);
            if (!line) continue;
            const frame = JSON.parse(line) as { type: string; data?: unknown };
            controller.enqueue(
              JSON.stringify(
                frame.type === 'record'
                  ? { ...frame, data: decorate(frame.data, getUrl) }
                  : frame,
              ) + '\n',
            );
          }
        },
        flush(controller) {
          if (pending) controller.enqueue(pending);
        },
      }),
    )
    .pipeThrough(new TextEncoderStream());
}

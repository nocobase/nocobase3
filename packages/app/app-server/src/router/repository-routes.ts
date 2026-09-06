import {
  databaseManagerToken,
  RepositoryError,
  type CreateOneOptions,
  type FindManyOptions,
  type Repository,
  type RepositoryFilter,
  type RepositoryRecord,
  type UpdateOneOptions,
} from '@nocobase/db';
import type { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { stream } from 'hono/streaming';

import { defineApiRoutes, type AppApiRouteContribution } from './routes.js';

export type RepositoryApiAction =
  | 'findMany'
  | 'findOne'
  | 'count'
  | 'exists'
  | 'createOne'
  | 'updateOne'
  | 'deleteOne';

export interface RepositoryApiExposure {
  /** The name passed to api.repository(name). */
  readonly name: string;
  /** Logical Collection name; defaults to name. */
  readonly collection?: string;
  /** Database connection name; defaults to the application's default connection. */
  readonly connection?: string;
  readonly actions: readonly RepositoryApiAction[];
  /** Default and maximum findMany limit. Defaults to 100. */
  readonly maxLimit?: number;
}

export interface DefineRepositoryApiRoutesOptions {
  readonly repositories: readonly RepositoryApiExposure[];
}

export interface RepositoryApiRoutesApplication {
  readonly container: ServiceContainer;
}

const allowedOptions: Record<RepositoryApiAction, readonly string[]> = {
  findMany: [
    'filter',
    'select',
    'sort',
    'distinct',
    'limit',
    'offset',
    'cursor',
    'direction',
  ],
  findOne: ['filter', 'select', 'sort'],
  count: ['filter'],
  exists: ['filter'],
  createOne: ['values', 'select'],
  updateOne: ['filter', 'values', 'select', 'ifVersion'],
  deleteOne: ['filter', 'select', 'ifVersion'],
};

const repositoryStreamMediaType = 'application/x-ndjson';

/**
 * Exposes only configured Repository endpoints using POST /<name>:<action>.
 * This basic adapter does not install authentication or authorization.
 * Database services are resolved only when the application creates the router.
 */
export function defineRepositoryApiRoutes(
  options: DefineRepositoryApiRoutesOptions,
): AppApiRouteContribution<RepositoryApiRoutesApplication> {
  const names = new Set<string>();
  const repositories = options.repositories.map((entry) => {
    if (!entry.name || entry.name.includes('*') || names.has(entry.name)) {
      throw new Error(
        'Repository API names must be non-empty, unique, and contain no wildcard.',
      );
    }
    names.add(entry.name);
    const maxLimit = entry.maxLimit ?? 100;
    if (!Number.isSafeInteger(maxLimit) || maxLimit <= 0) {
      throw new Error(
        'Repository API maxLimit must be a positive safe integer.',
      );
    }
    const collection = entry.collection ?? entry.name;
    if (!collection)
      throw new Error('Repository API collection must not be empty.');
    const actions = [...entry.actions];
    if (
      new Set(actions).size !== actions.length ||
      actions.some((action) => !Object.hasOwn(allowedOptions, action))
    ) {
      throw new Error('Repository API actions must be supported and unique.');
    }
    return { ...entry, collection, maxLimit, actions };
  });

  return defineApiRoutes((app: RepositoryApiRoutesApplication): Hono => {
    const router = new Hono();
    router.onError((error, context) => {
      if (error instanceof HTTPException) return error.getResponse();
      if (error instanceof RepositoryError) {
        const status = repositoryErrorStatus(error);
        if (status !== undefined) {
          return context.json(
            { code: error.code, message: error.message },
            status,
          );
        }
      }
      throw error;
    });

    for (const entry of repositories) {
      if (entry.actions.length === 0) continue;
      const repository = app.container
        .resolve(databaseManagerToken)
        .repository(entry.collection, entry.connection);
      for (const action of entry.actions) {
        router.post(
          `/${encodeURIComponent(entry.name)}:${action}`,
          bodyLimit({
            maxSize: 1024 * 1024,
            onError: (context) =>
              context.json(
                {
                  code: 'BODY_TOO_LARGE',
                  message: 'Repository request exceeds 1 MiB.',
                },
                413,
              ),
          }),
          async (context) => {
            const input = await readInput(context, action, entry.maxLimit);
            if (action === 'findMany' && acceptsRepositoryStream(context)) {
              return streamFindMany(context, repository, input);
            }
            const data = await execute(repository, action, input);
            return context.json({ data });
          },
        );
      }
    }
    return router;
  });
}

async function streamFindMany(
  context: Context,
  repository: Repository,
  input: FindManyOptions<RepositoryRecord>,
): Promise<Response> {
  const iterator = repository.findMany(input)[Symbol.asyncIterator]();
  let first: IteratorResult<RepositoryRecord>;
  try {
    first = await iterator.next();
  } catch (error) {
    await iterator.return?.();
    throw error;
  }

  const firstFrame = first.done ? undefined : recordFrame(first.value);
  let closePromise: Promise<void> | undefined;
  const closeIterator = (): Promise<void> => {
    closePromise ??= Promise.resolve(iterator.return?.()).then(() => undefined);
    return closePromise;
  };

  context.header('Content-Type', `${repositoryStreamMediaType}; charset=utf-8`);
  context.header('Cache-Control', 'no-store');
  context.header('X-Content-Type-Options', 'nosniff');
  context.header('Vary', 'Accept', { append: true });

  return stream(
    context,
    async (output) => {
      output.onAbort(closeIterator);
      try {
        if (firstFrame !== undefined) await output.writeln(firstFrame);
        while (!output.aborted) {
          const result = await iterator.next();
          if (result.done) break;
          await output.writeln(recordFrame(result.value));
        }
        if (!output.aborted) await output.writeln('{"type":"end"}');
      } finally {
        await closeIterator();
      }
    },
    async (error, output) => {
      if (!output.aborted) await output.writeln(errorFrame(error));
    },
  );
}

function acceptsRepositoryStream(context: Context): boolean {
  return (context.req.header('accept') ?? '')
    .split(',')
    .some(
      (value) =>
        value.split(';', 1)[0]?.trim().toLowerCase() ===
        repositoryStreamMediaType,
    );
}

function recordFrame(record: RepositoryRecord): string {
  return JSON.stringify({ type: 'record', data: record });
}

function errorFrame(error: Error): string {
  const exposed =
    error instanceof RepositoryError &&
    repositoryErrorStatus(error) !== undefined
      ? { code: error.code, message: error.message }
      : { code: 'INTERNAL_ERROR', message: 'Internal server error' };
  return JSON.stringify({ type: 'error', error: exposed });
}

async function readInput(
  context: Context,
  action: RepositoryApiAction,
  maxLimit: number,
): Promise<RepositoryRecord> {
  const contentType = context.req
    .header('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    fail(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Repository requests require application/json.',
    );
  }
  let input: unknown;
  try {
    input = await context.req.json<unknown>();
  } catch {
    fail(400, 'INVALID_JSON', 'Request body must contain valid JSON.');
  }
  if (!isObject(input))
    fail(400, 'INVALID_REPOSITORY_INPUT', 'Request body must be an object.');
  if (Object.hasOwn(input, 'idempotencyKey')) {
    fail(
      400,
      'UNSUPPORTED_REPOSITORY_OPTION',
      'idempotencyKey is not supported by this adapter.',
    );
  }
  for (const key of Object.keys(input)) {
    if (!allowedOptions[action].includes(key)) {
      fail(
        400,
        'UNSUPPORTED_REPOSITORY_OPTION',
        `Unsupported Repository option: ${key}.`,
      );
    }
  }
  for (const key of ['filter', 'values', 'select', 'sort', 'cursor']) {
    if (Object.hasOwn(input, key) && !isObject(input[key])) {
      fail(400, 'INVALID_REPOSITORY_INPUT', `${key} must be an object.`);
    }
  }
  if (
    ['findOne', 'updateOne', 'deleteOne'].includes(action) &&
    !isObject(input.filter)
  ) {
    fail(400, 'INVALID_REPOSITORY_INPUT', 'filter is required.');
  }
  if (['createOne', 'updateOne'].includes(action) && !isObject(input.values)) {
    fail(400, 'INVALID_REPOSITORY_INPUT', 'values is required.');
  }
  if (action === 'findMany') {
    const limit = input.limit === undefined ? maxLimit : input.limit;
    if (
      typeof limit !== 'number' ||
      !Number.isSafeInteger(limit) ||
      limit < 0 ||
      limit > maxLimit
    ) {
      fail(
        400,
        'INVALID_PAGINATION',
        `limit must be an integer between 0 and ${maxLimit}.`,
      );
    }
    input.limit = limit;
  }
  return input;
}

async function execute(
  repository: Repository,
  action: RepositoryApiAction,
  input: RepositoryRecord,
): Promise<unknown> {
  // HTTP validates the envelope; Repository validates ASTs, fields, and mutations.
  const read = input as FindManyOptions<RepositoryRecord>;
  const filter = input.filter as RepositoryFilter<RepositoryRecord>;
  const values = input.values as CreateOneOptions<
    Partial<RepositoryRecord>
  >['values'];
  const ifVersion = input.ifVersion as string | number | undefined;
  switch (action) {
    case 'findMany':
      return await repository.findMany(
        input as FindManyOptions<RepositoryRecord>,
      );
    case 'findOne':
      return (await repository.findOne({ ...read, filter })) ?? null;
    case 'count':
      return repository.count(input);
    case 'exists':
      return repository.exists(input);
    case 'createOne':
      return repository.createOne({ select: read.select, values });
    case 'updateOne':
      return repository.updateOne({
        select: read.select,
        filter,
        values: input.values as UpdateOneOptions<
          Partial<RepositoryRecord>
        >['values'],
        ifVersion,
      });
    case 'deleteOne':
      return repository.deleteOne({ select: read.select, filter, ifVersion });
  }
}

function isObject(value: unknown): value is RepositoryRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(status: 400 | 415, code: string, message: string): never {
  throw new HTTPException(status, {
    res: Response.json({ code, message }, { status }),
  });
}

function repositoryErrorStatus(
  error: RepositoryError,
): 400 | 404 | 409 | undefined {
  switch (error.code) {
    case 'RECORD_NOT_FOUND':
    case 'RELATION_TARGET_NOT_FOUND':
      return 404;
    case 'VERSION_CONFLICT':
    case 'MULTIPLE_RECORDS_MATCHED':
    case 'MULTIPLE_RELATION_TARGETS_MATCHED':
    case 'RELATION_UPSERT_TARGET_OUTSIDE_SCOPE':
    case 'RELATION_REASSIGNMENT_REQUIRED':
      return 409;
    case 'COLLECTION_NOT_FOUND':
    case 'INVALID_STORED_VALUE':
    case 'QUERY_ALREADY_CONSUMED':
    case 'QUERY_TRANSACTION_COMPLETED':
      return undefined;
    default:
      return 400;
  }
}

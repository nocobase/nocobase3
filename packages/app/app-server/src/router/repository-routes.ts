import {
  databaseManagerToken,
  buildWritePolicy,
  type WritePolicy,
  type WritePolicyInput,
  RepositoryError,
  type AggregateOptions,
  type GroupByOptions,
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
  | 'aggregate'
  | 'groupBy'
  | 'exists'
  | 'createOne'
  | 'updateOne'
  | 'deleteOne';

/** An enabled endpoint with no configurable options. */
export type RepositoryApiEmptyActionOptions = Readonly<Record<string, never>>;
export interface RepositoryApiFindManyOptions {
  /** Default and maximum limit. Defaults to 100. */
  readonly maxLimit?: number;
}
export interface RepositoryApiWriteOptions {
  /** Server-owned policy. HTTP input cannot override this value. */
  readonly writePolicy?: false | WritePolicyInput;
}
export interface RepositoryApiActions {
  readonly findMany?: RepositoryApiFindManyOptions;
  readonly findOne?: RepositoryApiEmptyActionOptions;
  readonly count?: RepositoryApiEmptyActionOptions;
  readonly exists?: RepositoryApiEmptyActionOptions;
  readonly aggregate?: RepositoryApiEmptyActionOptions;
  readonly groupBy?: RepositoryApiEmptyActionOptions;
  readonly createOne?: RepositoryApiWriteOptions;
  readonly updateOne?: RepositoryApiWriteOptions;
  readonly deleteOne?: RepositoryApiEmptyActionOptions;
}

export interface RepositoryApiExposure {
  /** The name passed to api.repository(name). */
  readonly name: string;
  /** Logical Collection name; defaults to name. */
  readonly collection?: string;
  /** Database connection name; defaults to the application's default connection. */
  readonly connection?: string;
  readonly actions: RepositoryApiActions;
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
  aggregate: ['filter', 'aggregate'],
  groupBy: ['by', 'filter', 'aggregate', 'having', 'sort'],
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
  assertConfig(options, ['repositories'], 'Repository API configuration');
  if (!Array.isArray(options.repositories))
    throw new Error('repositories must be an array.');
  const names = new Set<string>();
  const repositories = options.repositories.map((entry) => {
    assertConfig(
      entry,
      ['name', 'collection', 'connection', 'actions'],
      'Repository API exposure',
    );
    if (
      typeof entry.name !== 'string' ||
      !entry.name ||
      entry.name.includes('*') ||
      names.has(entry.name)
    ) {
      throw new Error(
        'Repository API names must be non-empty, unique, and contain no wildcard.',
      );
    }
    names.add(entry.name);
    const collection = entry.collection ?? entry.name;
    if (typeof collection !== 'string' || !collection)
      throw new Error('Repository API collection must not be empty.');
    if (
      entry.connection !== undefined &&
      (typeof entry.connection !== 'string' || !entry.connection)
    )
      throw new Error('Repository API connection must not be empty.');
    assertConfig(
      entry.actions,
      Object.keys(allowedOptions),
      'Repository API actions',
    );
    const actions = Object.entries(entry.actions).map(([key, config]) => {
      const action = key as RepositoryApiAction;
      const keys =
        action === 'findMany'
          ? ['maxLimit']
          : action === 'createOne' || action === 'updateOne'
            ? ['writePolicy']
            : [];
      assertConfig(config, keys, `Repository API action ${action}`);
      const maxLimit =
        action === 'findMany' && config.maxLimit !== undefined
          ? config.maxLimit
          : 100;
      if (
        typeof maxLimit !== 'number' ||
        !Number.isSafeInteger(maxLimit) ||
        maxLimit <= 0
      )
        throw new Error(
          'Repository API maxLimit must be a positive safe integer.',
        );
      const policyInput =
        config.writePolicy === undefined ? false : config.writePolicy;
      const writePolicy: false | WritePolicy =
        policyInput === false
          ? false
          : buildWritePolicy(policyInput as WritePolicyInput);
      if (action === 'createOne') assertCreateAllowance(writePolicy);
      return { action, maxLimit, writePolicy };
    });
    return {
      name: entry.name,
      collection,
      connection: entry.connection,
      actions,
    };
  });

  return defineApiRoutes((app: RepositoryApiRoutesApplication): Hono => {
    const router = new Hono();
    router.onError((error, context) => {
      if (error instanceof HTTPException) return error.getResponse();
      if (error instanceof RepositoryError) {
        const status = repositoryErrorStatus(error);
        if (status !== undefined) {
          return context.json(
            {
              code: error.code,
              message: error.message,
              ...([
                'WRITE_FORBIDDEN',
                'FIELD_WRITE_FORBIDDEN',
                'RELATION_WRITE_FORBIDDEN',
              ].includes(error.code)
                ? { path: error.path, details: error.details }
                : {}),
            },
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
      for (const { action, maxLimit, writePolicy } of entry.actions) {
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
            const input = await readInput(context, action, maxLimit);
            if (action === 'findMany' && acceptsRepositoryStream(context)) {
              return streamFindMany(context, repository, input);
            }
            const data = await execute(repository, action, input, writePolicy);
            if (action === 'aggregate' || action === 'groupBy') {
              return context.body(
                JSON.stringify({ data }, (_key, value: unknown) =>
                  typeof value === 'bigint' ? value.toString() : value,
                ),
                200,
                { 'Content-Type': 'application/json; charset=UTF-8' },
              );
            }
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
  for (const key of [
    'filter',
    'values',
    'select',
    'sort',
    'cursor',
    'aggregate',
    'having',
  ]) {
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
  if (action === 'aggregate' || action === 'groupBy') {
    if (!isObject(input.aggregate))
      fail(400, 'INVALID_REPOSITORY_INPUT', 'aggregate is required.');
  }
  if (
    action === 'groupBy' &&
    (!Array.isArray(input.by) ||
      input.by.length === 0 ||
      input.by.some((field) => typeof field !== 'string' || !field))
  ) {
    fail(
      400,
      'INVALID_REPOSITORY_INPUT',
      'by must be a non-empty array of field names.',
    );
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
  writePolicy: false | WritePolicy,
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
    case 'aggregate':
      return repository.aggregate(
        input as unknown as AggregateOptions<RepositoryRecord>,
      );
    case 'groupBy':
      return repository.groupBy(
        input as unknown as GroupByOptions<RepositoryRecord>,
      );
    case 'count':
      return repository.count(input);
    case 'exists':
      return repository.exists(input);
    case 'createOne':
      return repository.createOne({
        select: read.select,
        values,
        writePolicy,
      });
    case 'updateOne':
      return repository.updateOne({
        writePolicy,
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
): 400 | 403 | 404 | 409 | undefined {
  switch (error.code) {
    case 'WRITE_FORBIDDEN':
    case 'FIELD_WRITE_FORBIDDEN':
    case 'RELATION_WRITE_FORBIDDEN':
      return 403;
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

function assertConfig(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    !isObject(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new Error(`${label} must be a plain configuration object.`);
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      throw new Error(`${label}: unsupported option ${key}.`);
}

function assertCreateAllowance(policy: false | WritePolicy): void {
  if (policy === false) return;
  for (const rule of Object.values(policy.relations || {})) {
    if (
      Object.keys(rule).some(
        (operation) => operation !== 'create' && operation !== 'connect',
      )
    )
      throw new Error(
        'createOne writePolicy only supports create and connect relation operations.',
      );
    if (rule.create) assertCreateAllowance(rule.create);
  }
}

/**
 * The model services online agents call (`agModelServices`): listing, adding, editing, switching off and deleting
 * them, fetching a provider's models and checking a model over a connection being edited, and what the gateway reads
 * of them (the catalog of one kind of model and a service's connection). A model is a chat, embedding or rerank model
 * (`ModelKind`), of a kind its provider serves (`MODEL_PROVIDERS[].kinds`); an embedding model may ask for vectors of
 * a size (`dimensions`). The routes (`routes.ts`) serve the management behind
 * `agents.services`; nothing here knows HTTP.
 *
 * A provider may have any number of services. Keys are sealed with the application's secrets keys, as variables are
 * (`kernel/secrets.ts`), and never answered: a view says whether one is set. So are the values of the request headers
 * marked secret, sealed together as one JSON object (`headersEncrypted`, bound to the service's name and `headers`).
 * Deleting a service deletes its model prices.
 */
import type { DatabaseConnection } from '@nocobase/db';
import { z } from 'zod';

import {
  MODEL_HEADER_NAME_PATTERN,
  MODEL_HEADERS_MAX,
  MODEL_KINDS,
  MODEL_PROVIDER_NAMES,
  RESERVED_MODEL_HEADERS,
  guessModelKind,
  providerOf,
  type CreateModelServiceRequest,
  type DefaultChatModel,
  type DefaultModels,
  type ModelCatalog,
  type ModelCheck,
  type ModelConnectionCheckRequest,
  type ModelConnectionRequest,
  type ModelHeaderInput,
  type ModelHeaderView,
  type ModelInput,
  type ModelKind,
  type ModelOption,
  type ModelProviderName,
  type ModelRef,
  type ModelServiceView,
  type ProviderModels,
  type UpdateModelServiceRequest,
} from '../../shared/models.js';
import { ONLINE_TOOL } from '../../shared/reports.js';
import { settingsRepo } from '../core/conversations/conversation.store.js';
import type { Clock } from '../kernel/clock.js';
import type { Sealer } from '../kernel/secrets.js';
import { invalid, notFound } from '../kernel/errors.js';
import type { TxRunner } from '../kernel/tx.js';
import { asJson, jsonObject } from '../kernel/values.js';
import {
  answered,
  checkEmbedding,
  checkModel,
  checkRerank,
  CHECK_TIMEOUT_MS,
  type CheckResult,
  type ModelErrorCode,
  ModelError,
  type ModelEndpoint,
  type ModelSource,
} from './gateway.js';
import { listModels, type ModelConnection } from './providers.js';

const SERVICES = 'agModelServices';
const PRICES = 'agModelPrices';
/** The failures a model of another kind answers with, rather than a connection, key or quota problem. */
const WRONG_KIND_CODES: ReadonlySet<ModelErrorCode> = new Set([
  'config',
  'badResponse',
  'unknown',
]);

/** The `agSettings` key of the default models. */
const DEFAULTS_KEY = 'models';

interface ServiceRecord {
  readonly name: string;
  readonly title: string;
  readonly provider: string;
  readonly baseUrl: string | null;
  readonly apiKeyEncrypted: string | null;
  readonly headers: unknown;
  readonly headersEncrypted: string | null;
  readonly enabled: boolean | number;
  readonly models: unknown;
  readonly sort: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const KindSchema = z.enum(MODEL_KINDS as [ModelKind, ...ModelKind[]]);
const DimensionsSchema = z.number().int().min(1).max(8192).nullable();

const ModelsSchema = z
  .array(
    z
      .strictObject({
        value: z.string().trim().min(1).max(200),
        label: z.string().trim().max(200).optional(),
        kind: KindSchema.optional(),
        dimensions: DimensionsSchema.optional(),
      })
      .refine(
        (model) => !model.dimensions || model.kind === 'embedding',
        'Only an embedding model has dimensions.',
      ),
  )
  .max(500);

const HeadersSchema = z
  .array(
    z.strictObject({
      name: z.string().trim().min(1).max(100),
      value: z.string().max(4000).optional(),
      secret: z.boolean().optional(),
    }),
  )
  .max(MODEL_HEADERS_MAX);

const ProviderSchema = z.enum(
  MODEL_PROVIDER_NAMES as [ModelProviderName, ...ModelProviderName[]],
);

export const CreateServiceSchema: z.ZodType<CreateModelServiceRequest> =
  z.strictObject({
    title: z.string().trim().min(1).max(100),
    provider: ProviderSchema,
    baseUrl: z.string().trim().max(500).nullable().optional(),
    apiKey: z.string().max(4000).nullable().optional(),
    headers: HeadersSchema.optional(),
    models: ModelsSchema.optional(),
    enabled: z.boolean().optional(),
  });

export const UpdateServiceSchema: z.ZodType<UpdateModelServiceRequest> =
  z.strictObject({
    title: z.string().trim().min(1).max(100).optional(),
    baseUrl: z.string().trim().max(500).nullable().optional(),
    apiKey: z.string().max(4000).nullable().optional(),
    headers: HeadersSchema.optional(),
    models: ModelsSchema.optional(),
    enabled: z.boolean().optional(),
  });

export const ModelRefSchema: z.ZodType<ModelRef> = z.strictObject({
  modelService: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(200),
});

export const ConnectionSchema: z.ZodType<ModelConnectionRequest> =
  z.strictObject({
    service: z.string().trim().min(1).max(64).optional(),
    provider: ProviderSchema.optional(),
    baseUrl: z.string().trim().max(500).nullable().optional(),
    apiKey: z.string().max(4000).nullable().optional(),
    headers: HeadersSchema.optional(),
  });

export const ConnectionCheckSchema: z.ZodType<ModelConnectionCheckRequest> =
  z.strictObject({
    service: z.string().trim().min(1).max(64).optional(),
    provider: ProviderSchema.optional(),
    baseUrl: z.string().trim().max(500).nullable().optional(),
    apiKey: z.string().max(4000).nullable().optional(),
    headers: HeadersSchema.optional(),
    model: z.string().trim().min(1).max(200),
    kind: KindSchema.optional(),
    dimensions: DimensionsSchema.optional(),
  });

export interface ModelServices extends ModelSource {
  list(): Promise<ModelServiceView[]>;
  create(input: CreateModelServiceRequest): Promise<ModelServiceView>;
  update(
    name: string,
    input: UpdateModelServiceRequest,
  ): Promise<ModelServiceView>;
  remove(name: string): Promise<void>;
  /** The models the provider lists over the connection, or what it said instead. */
  models(request: ModelConnectionRequest): Promise<ProviderModels>;
  /**
   * Whether the model answers over the connection as its kind says; never throws for the provider's sake. When it
   * does not but answers as another kind its provider serves, `looksLike` says which.
   */
  check(request: ModelConnectionCheckRequest): Promise<ModelCheck>;
  /** The default models, as set and as used now; read on `conn` inside a transaction. */
  defaults(conn?: DatabaseConnection): Promise<DefaultModels>;
  /** Sets the default chat model, which must be one an enabled service offers. */
  setDefaultChat(
    ref: ModelRef,
    byUserId: string | null,
  ): Promise<DefaultModels>;
}

const kindOf = (value: unknown): ModelKind =>
  typeof value === 'string' &&
  (MODEL_KINDS as readonly string[]).includes(value)
    ? (value as ModelKind)
    : 'chat';

const dimensionsOf = (kind: ModelKind, value: unknown): number | null =>
  kind === 'embedding' &&
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value > 0
    ? value
    : null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** The models a stored list offers, in order and each once; a model without a kind is a chat model. */
function modelsOf(stored: unknown): ModelOption[] {
  const seen = new Set<string>();
  const models: ModelOption[] = [];
  for (const item of Array.isArray(stored) ? (stored as unknown[]) : []) {
    if (!isRecord(item)) continue;
    const value = text(item.value);
    const kind = kindOf(item.kind);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    models.push({
      value,
      label: text(item.label) ?? value,
      kind,
      dimensions: dimensionsOf(kind, item.dimensions),
    });
  }
  return models;
}

/** The models as stored, refused when one is of a kind the provider does not serve. */
function cleanModels(
  provider: ModelProviderName,
  models: readonly ModelInput[],
): ModelOption[] {
  const kinds = providerOf(provider)?.kinds ?? ['chat'];
  for (const model of models) {
    if (model.dimensions && (model.kind ?? 'chat') !== 'embedding')
      throw invalid(
        `${model.value} is not an embedding model: it has no dimensions.`,
      );
    if (!kinds.includes(model.kind ?? 'chat'))
      throw invalid(
        `${providerOf(provider)?.title ?? provider} serves no ${model.kind ?? 'chat'} models.`,
      );
  }
  return modelsOf(models.map((model) => ({ ...model })));
}

/** A name from the title: lower-case ASCII letters, digits and dashes; the provider's when the title has none. */
export function nameFrom(title: string, provider: string): string {
  const slug = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  return slug || provider;
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const url = text(value);
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid('The base URL is not a URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw invalid('The base URL must start with http:// or https://.');
  return url.replace(/\/+$/u, '');
}

/** A request header as stored (`agModelServices.headers`): a secret one's value is sealed apart. */
interface StoredHeader {
  readonly name: string;
  readonly secret: boolean;
  readonly value: string | null;
}

/** The headers a service sends, as they were set: names and plain values, secret values sealed apart. */
interface HeaderPlan {
  readonly stored: StoredHeader[];
  /** The secret headers' values, by lower-case name. */
  readonly secrets: Record<string, string>;
}

function storedHeadersOf(value: unknown): StoredHeader[] {
  return (Array.isArray(value) ? (value as unknown[]) : []).flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== 'string') return [];
    return [
      {
        name: item.name,
        secret: item.secret === true,
        value: typeof item.value === 'string' ? item.value : null,
      },
    ];
  });
}

/** A header name a service may send: an HTTP token, none of the reserved ones. */
function checkHeaderName(name: string, field: string): string {
  const trimmed = name.trim();
  if (!MODEL_HEADER_NAME_PATTERN.test(trimmed))
    throw invalid(`${trimmed || 'A header name'} is not a header name.`, {
      field,
    });
  if (RESERVED_MODEL_HEADERS.includes(trimmed.toLowerCase()))
    throw invalid(
      `A service cannot set ${trimmed}: HTTP sets it, or it carries the credentials, which go as the API key.`,
      { field },
    );
  return trimmed;
}

/**
 * The headers as set, each checked; a secret header without a value takes the one `saved` has under its name
 * (lower case), and needs one there.
 */
function planHeaders(
  input: readonly ModelHeaderInput[],
  saved: Readonly<Record<string, string>>,
): HeaderPlan {
  if (input.length > MODEL_HEADERS_MAX)
    throw invalid(`A service sends at most ${MODEL_HEADERS_MAX} headers.`, {
      field: 'headers',
    });
  const seen = new Set<string>();
  const stored: StoredHeader[] = [];
  const secrets: Record<string, string> = {};
  input.forEach((header, index) => {
    const field = `headers.${index}`;
    const name = checkHeaderName(header.name, `${field}.name`);
    const key = name.toLowerCase();
    if (seen.has(key))
      throw invalid(`The header ${name} is set twice.`, { field });
    seen.add(key);
    const value = header.value ?? (header.secret ? saved[key] : undefined);
    if (value === undefined || value.trim() === '')
      throw invalid(`The header ${name} needs a value.`, {
        field: `${field}.value`,
      });
    if (value.length > 4000 || /[\r\n\0]/u.test(value))
      throw invalid(
        `The value of ${name} must be one line of at most 4000 characters.`,
        { field: `${field}.value` },
      );
    if (header.secret) {
      secrets[key] = value.trim();
      stored.push({ name, secret: true, value: null });
    } else stored.push({ name, secret: false, value: value.trim() });
  });
  return { stored, secrets };
}

/** The headers of a connection by lower-case name, as `planHeaders` takes the saved ones. */
const byLowerName = (
  headers: Readonly<Record<string, string>>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );

const providerName = (record: ServiceRecord): ModelProviderName =>
  ProviderSchema.parse(record.provider);

function view(record: ServiceRecord): ModelServiceView {
  return {
    name: record.name,
    title: record.title,
    provider: providerName(record),
    baseUrl: record.baseUrl,
    apiKeySet: record.apiKeyEncrypted !== null,
    headers: storedHeadersOf(record.headers).map((header): ModelHeaderView => ({
      name: header.name,
      secret: header.secret,
      value: header.secret ? null : header.value,
      valueSet: header.secret
        ? record.headersEncrypted !== null
        : header.value !== null,
    })),
    enabled: Boolean(record.enabled),
    models: modelsOf(record.models),
  };
}

/** The enabled services with their models of `kind`, those offering none left out. */
function offeredOf(
  records: readonly ServiceRecord[],
  kind: ModelKind,
): ModelCatalog['services'][number][] {
  return records
    .filter((record) => Boolean(record.enabled))
    .map((record) => ({
      name: record.name,
      title: record.title,
      provider: record.provider,
      models: modelsOf(record.models).filter((model) => model.kind === kind),
    }))
    .filter((service) => service.models.length > 0);
}

/** `ref` as a chat model an enabled service offers, with its titles; null when none offers it. */
function offeredRef(
  records: readonly ServiceRecord[],
  ref: ModelRef,
): DefaultChatModel | null {
  const service = offeredOf(records, 'chat').find(
    (item) => item.name === ref.modelService,
  );
  const model = service?.models.find((item) => item.value === ref.model);
  return service && model
    ? {
        modelService: service.name,
        model: model.value,
        serviceTitle: service.title,
        modelLabel: model.label,
      }
    : null;
}

/** The default chat model used now: `set` while it is offered, else the first chat model offered. */
function effectiveChat(
  records: readonly ServiceRecord[],
  set: ModelRef | null,
): DefaultChatModel | null {
  const chosen = set ? offeredRef(records, set) : null;
  if (chosen) return chosen;
  const first = offeredOf(records, 'chat').at(0);
  const model = first?.models.at(0);
  return first && model
    ? {
        modelService: first.name,
        model: model.value,
        serviceTitle: first.title,
        modelLabel: model.label,
      }
    : null;
}

function defaultsOf(
  records: readonly ServiceRecord[],
  set: ModelRef | null,
): DefaultModels {
  return { chat: set, effectiveChat: effectiveChat(records, set) };
}

export function createModelServices(deps: {
  readonly tx: TxRunner;
  readonly clock: Clock;
  readonly box: Sealer;
}): ModelServices {
  const repo = (conn: DatabaseConnection) =>
    conn.repository<ServiceRecord>(SERVICES);

  const all = (conn: DatabaseConnection) =>
    repo(conn).findMany({
      sort: (sort) => [sort.field('sort').asc(), sort.field('name').asc()],
    });

  async function stored(
    conn: DatabaseConnection,
    name: string,
  ): Promise<ServiceRecord> {
    const record = (await repo(conn).findMany({ filter: { name } })).at(0);
    if (!record) throw notFound('Model service');
    return record;
  }

  function keyOf(record: ServiceRecord): string | null {
    if (record.apiKeyEncrypted === null) return null;
    return deps.box.open(record.apiKeyEncrypted, [record.name]);
  }

  /** A key is bound to its service's name, which never changes. */
  function sealed(
    name: string,
    apiKey: string | null,
  ): { apiKeyEncrypted: string | null } {
    return { apiKeyEncrypted: apiKey ? deps.box.seal(apiKey, [name]) : null };
  }

  /** The secret headers' values by lower-case name; none when there are none. */
  function secretsOf(record: ServiceRecord): Record<string, string> {
    if (record.headersEncrypted === null) return {};
    const opened = JSON.parse(
      deps.box.open(record.headersEncrypted, [record.name, 'headers']),
    ) as unknown;
    return isRecord(opened)
      ? Object.fromEntries(
          Object.entries(opened).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};
  }

  /** The secret headers' values, bound to the service's name like its key. */
  function sealedHeaders(
    name: string,
    plan: HeaderPlan,
  ): { headers: StoredHeader[]; headersEncrypted: string | null } {
    return {
      headers: plan.stored,
      headersEncrypted:
        Object.keys(plan.secrets).length > 0
          ? deps.box.seal(JSON.stringify(plan.secrets), [name, 'headers'])
          : null,
    };
  }

  /** The headers a plan sends: each by its name, secret ones with their values. */
  const headersFrom = (plan: HeaderPlan): Record<string, string> =>
    Object.fromEntries(
      plan.stored.flatMap((header) => {
        const value = header.secret
          ? plan.secrets[header.name.toLowerCase()]
          : header.value;
        return value === undefined || value === null
          ? []
          : [[header.name, value]];
      }),
    );

  const connectionOf = (record: ServiceRecord): ModelConnection => ({
    provider: providerName(record),
    baseUrl: record.baseUrl,
    apiKey: keyOf(record),
    headers: headersFrom({
      stored: storedHeadersOf(record.headers),
      secrets: secretsOf(record),
    }),
  });

  /** The connection being tried: the edited values over the saved service's. */
  async function tried(
    request: ModelConnectionRequest,
  ): Promise<ModelConnection> {
    const saved = request.service
      ? connectionOf(await stored(deps.tx.read(), request.service))
      : null;
    const provider = request.provider ?? saved?.provider;
    if (!provider) throw invalid('Choose a provider.');
    const plan =
      request.headers === undefined
        ? null
        : planHeaders(request.headers, byLowerName(saved?.headers ?? {}));
    const headers = plan ? headersFrom(plan) : (saved?.headers ?? {});
    return {
      provider,
      baseUrl:
        request.baseUrl === undefined
          ? (saved?.baseUrl ?? null)
          : normalizeBaseUrl(request.baseUrl),
      apiKey:
        request.apiKey === undefined
          ? (saved?.apiKey ?? null)
          : text(request.apiKey),
      headers,
    };
  }

  /** Adds a service under `name`, after the others. */
  async function insert(
    conn: DatabaseConnection,
    name: string,
    input: CreateModelServiceRequest,
  ): Promise<void> {
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    if (!baseUrl && !providerOf(input.provider)?.defaultBaseUrl)
      throw invalid('This provider needs a base URL.');
    const plan = planHeaders(input.headers ?? [], {});
    const services = await all(conn);
    const now = deps.clock.now().toISOString();
    await repo(conn).createOne({
      values: {
        name,
        title: input.title.trim(),
        provider: input.provider,
        baseUrl,
        ...sealed(name, text(input.apiKey)),
        ...sealedHeaders(name, plan),
        enabled: input.enabled !== false,
        models: cleanModels(input.provider, input.models ?? []),
        sort: services.reduce((top, row) => Math.max(top, row.sort), 0) + 1,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  async function storedDefault(
    conn: DatabaseConnection,
  ): Promise<ModelRef | null> {
    const row = await settingsRepo(conn).findOne({
      filter: { key: DEFAULTS_KEY },
    });
    const chat = jsonObject(jsonObject(row?.value).chat);
    const modelService = text(chat.modelService);
    const model = text(chat.model);
    return modelService && model ? { modelService, model } : null;
  }

  async function writeDefault(
    conn: DatabaseConnection,
    chat: ModelRef | null,
    byUserId: string | null,
  ): Promise<void> {
    const values = {
      value: asJson({
        chat: chat
          ? { modelService: chat.modelService, model: chat.model }
          : null,
      }),
      updatedById: byUserId,
      updatedAt: deps.clock.now().toISOString(),
    };
    const filter = { key: DEFAULTS_KEY };
    if (await settingsRepo(conn).findOne({ filter }))
      await settingsRepo(conn).updateMany({ filter, values });
    else
      await settingsRepo(conn).createOne({
        values: { key: DEFAULTS_KEY, ...values },
      });
  }

  /** With no default chat model set, the first chat model offered becomes it. */
  async function ensureDefault(conn: DatabaseConnection): Promise<void> {
    if (await storedDefault(conn)) return;
    const first = effectiveChat(await all(conn), null);
    if (first)
      await writeDefault(
        conn,
        { modelService: first.modelService, model: first.model },
        null,
      );
  }

  const names = async (conn: DatabaseConnection) =>
    new Set((await all(conn)).map((service) => service.name));

  return {
    async list() {
      return (await all(deps.tx.read())).map(view);
    },

    create(input) {
      return deps.tx.run(async ({ conn }) => {
        const taken = await names(conn);
        const base = nameFrom(input.title.trim(), input.provider);
        let name = base;
        for (let suffix = 2; taken.has(name); suffix += 1)
          name = `${base}-${suffix}`;
        await insert(conn, name, input);
        await ensureDefault(conn);
        return view(await stored(conn, name));
      });
    },

    update(name, input) {
      return deps.tx.run(async ({ conn }) => {
        const current = await stored(conn, name);
        const baseUrl =
          input.baseUrl === undefined
            ? undefined
            : normalizeBaseUrl(input.baseUrl);
        if (baseUrl === null && !providerOf(current.provider)?.defaultBaseUrl)
          throw invalid('This provider needs a base URL.');
        const currentHeaders = storedHeadersOf(current.headers);
        const plan =
          input.headers === undefined
            ? null
            : planHeaders(
                input.headers,
                input.headers.some((header) => header.secret && !header.value)
                  ? byLowerName(
                      headersFrom({
                        stored: currentHeaders,
                        secrets: secretsOf(current),
                      }),
                    )
                  : {},
              );
        await repo(conn).updateMany({
          filter: { name },
          values: {
            ...(input.title === undefined ? {} : { title: input.title.trim() }),
            ...(baseUrl === undefined ? {} : { baseUrl }),
            ...(input.apiKey === undefined
              ? {}
              : sealed(name, text(input.apiKey))),
            ...(plan === null ? {} : sealedHeaders(name, plan)),
            ...(input.models === undefined
              ? {}
              : { models: cleanModels(providerName(current), input.models) }),
            ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
            updatedAt: deps.clock.now().toISOString(),
          },
        });
        await ensureDefault(conn);
        return view(await stored(conn, name));
      });
    },

    remove(name) {
      return deps.tx.run(async ({ conn }) => {
        await stored(conn, name);
        await repo(conn).deleteMany({ filter: { name } });
        await conn
          .repository(PRICES)
          .deleteMany({ filter: { tool: ONLINE_TOOL, modelService: name } });
      });
    },

    async models(request) {
      const connection = await tried(request);
      try {
        const kinds = providerOf(connection.provider)?.kinds ?? ['chat'];
        return {
          ok: true,
          items: (
            await listModels(connection, AbortSignal.timeout(CHECK_TIMEOUT_MS))
          ).map((id) => ({ id, kind: guessModelKind(id, kinds) })),
        };
      } catch (error) {
        return {
          ok: false,
          message: (error instanceof Error
            ? error.message
            : String(error)
          ).slice(0, 500),
        };
      }
    },

    async check(request) {
      const connection = await tried(request);
      const kind = request.kind ?? 'chat';
      if (!(providerOf(connection.provider)?.kinds ?? []).includes(kind))
        return {
          ok: false,
          message: `${providerOf(connection.provider)?.title ?? connection.provider} serves no ${kind} models.`,
        };
      const model = request.model.trim();
      const as = (other: ModelKind): Promise<CheckResult> => {
        switch (other) {
          case 'embedding':
            return checkEmbedding(
              connection,
              model,
              other === kind ? (request.dimensions ?? null) : null,
            );
          case 'rerank':
            return checkRerank(connection, model);
          default:
            return checkModel(connection, model);
        }
      };
      const checked = await as(kind);
      // A model that answers as another kind its provider serves was given the wrong kind; tried at once, unless the
      // failure is the connection's or the account's rather than the model's.
      if (checked.ok || !WRONG_KIND_CODES.has(checked.code ?? 'unknown'))
        return answered(checked);
      const others = (providerOf(connection.provider)?.kinds ?? []).filter(
        (other) => other !== kind,
      );
      const answers = await Promise.all(others.map((other) => as(other)));
      const looksLike = others.find((_, index) => answers[index]?.ok) ?? null;
      return answered(looksLike ? { ...checked, looksLike } : checked);
    },

    async catalog(kind: ModelKind = 'chat'): Promise<ModelCatalog> {
      const conn = deps.tx.read();
      const records = await all(conn);
      const services = offeredOf(records, kind);
      if (kind !== 'chat') return { services };
      const chosen = effectiveChat(records, await storedDefault(conn));
      return {
        services,
        defaultModel: chosen
          ? { modelService: chosen.modelService, model: chosen.model }
          : null,
      };
    },

    async defaults(on) {
      const conn = on ?? deps.tx.read();
      return defaultsOf(await all(conn), await storedDefault(conn));
    },

    setDefaultChat(ref, byUserId) {
      return deps.tx.run(async ({ conn }) => {
        const records = await all(conn);
        if (!offeredRef(records, ref))
          throw invalid(
            `No enabled model service offers the chat model ${ref.model} of ${ref.modelService}.`,
            { field: 'model' },
          );
        await writeDefault(conn, ref, byUserId);
        return defaultsOf(records, ref);
      });
    },

    async connectionFor(ref: ModelRef, kind: ModelKind = 'chat') {
      return (await endpoint(ref, kind)).connection;
    },

    endpointFor: (ref, kind) => endpoint(ref, kind),
  };

  async function endpoint(
    ref: ModelRef,
    kind: ModelKind,
  ): Promise<ModelEndpoint> {
    const record = (
      await repo(deps.tx.read()).findMany({
        filter: { name: ref.modelService },
      })
    ).at(0);
    if (!record?.enabled)
      throw new ModelError(
        'config',
        `The model service ${ref.modelService} is not there or is off.`,
      );
    const offered = modelsOf(record.models).find(
      (model) => model.value === ref.model && model.kind === kind,
    );
    if (!offered)
      throw new ModelError(
        'config',
        `The model service ${ref.modelService} does not offer the ${kind} model ${ref.model}.`,
      );
    let connection: ModelConnection;
    try {
      connection = connectionOf(record);
    } catch (error) {
      throw new ModelError(
        'auth',
        'The service’s API key or secret headers cannot be read with this application’s secrets keys; set them again.',
        { cause: error },
      );
    }
    if (!connection.apiKey && providerOf(connection.provider)?.keyRequired)
      throw new ModelError(
        'auth',
        `The model service ${ref.modelService} has no API key.`,
      );
    return { connection, dimensions: offered.dimensions };
  }
}

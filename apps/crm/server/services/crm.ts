import type { AuthSession } from '@nocobase/app-plugin-authentication';
import type { DatabaseManager } from '@nocobase/database';
import type { Knex } from 'knex';

export const CRM_RESOURCES = [
  'agent_crm_accounts',
  'agent_crm_contacts',
  'agent_crm_leads',
  'agent_crm_opportunities',
  'agent_crm_activities',
] as const;

export type CrmResourceName = (typeof CRM_RESOURCES)[number];
export type CrmApiResourceName = CrmResourceName | 'user';
export type CrmRecord = Record<string, unknown> & { id: string | number };

export interface CrmListOptions {
  page?: number;
  pageSize?: number;
  filter?: unknown;
  sort?: string;
  appends?: string[];
}

export interface CrmListResult {
  rows: CrmRecord[];
  count: number;
}

export interface CrmQueryRequest {
  measures?: unknown;
  dimensions?: unknown;
  orders?: unknown;
  filter?: unknown;
  limit?: unknown;
  offset?: unknown;
}

export interface CrmSeedResult {
  created: number;
  updated: number;
  unchanged: number;
}

export interface CrmService {
  list(
    resource: CrmApiResourceName,
    options?: CrmListOptions,
  ): Promise<CrmListResult>;
  get(
    resource: CrmApiResourceName,
    id: string | number,
    appends?: string[],
  ): Promise<CrmRecord | undefined>;
  create(
    resource: CrmResourceName,
    values: unknown,
    actor: AuthSession,
  ): Promise<CrmRecord>;
  update(
    resource: CrmResourceName,
    id: string | number,
    values: unknown,
    actor: AuthSession,
  ): Promise<CrmRecord>;
  destroy(resource: CrmResourceName, id: string | number): Promise<CrmRecord>;
  query(
    resource: CrmResourceName,
    request: CrmQueryRequest,
  ): Promise<CrmRecord[]>;
}

type ResourceDefinition = {
  editable: readonly string[];
  required: readonly string[];
  searchable: readonly string[];
  relations: Readonly<Record<string, RelationDefinition>>;
  defaults?: Readonly<Record<string, unknown>>;
};

type RelationDefinition = {
  foreignKey: string;
  target: CrmApiResourceName;
};

const resourceDefinitions: Record<CrmResourceName, ResourceDefinition> = {
  agent_crm_accounts: {
    editable: [
      'name',
      'industry',
      'tier',
      'status',
      'region',
      'website',
      'phone',
      'notes',
    ],
    required: ['name', 'status'],
    searchable: ['name', 'industry', 'region', 'status', 'tier'],
    relations: {},
    defaults: { tier: 'standard', status: 'prospect' },
  },
  agent_crm_contacts: {
    editable: [
      'name',
      'jobTitle',
      'decisionRole',
      'accountId',
      'email',
      'phone',
      'notes',
    ],
    required: ['name', 'accountId'],
    searchable: ['name', 'jobTitle', 'decisionRole', 'email'],
    relations: {
      account: { foreignKey: 'accountId', target: 'agent_crm_accounts' },
    },
  },
  agent_crm_leads: {
    editable: [
      'name',
      'company',
      'status',
      'source',
      'score',
      'email',
      'phone',
      'ownerId',
      'notes',
    ],
    required: ['name', 'company', 'status'],
    searchable: ['code', 'name', 'company', 'status', 'source', 'email'],
    relations: { owner: { foreignKey: 'ownerId', target: 'user' } },
    defaults: { status: 'new', source: 'inbound', score: 50 },
  },
  agent_crm_opportunities: {
    editable: [
      'name',
      'accountId',
      'stage',
      'amount',
      'probability',
      'expectedCloseDate',
      'nextStep',
      'ownerId',
      'notes',
    ],
    required: ['name', 'accountId', 'stage', 'amount'],
    searchable: ['name', 'stage', 'nextStep'],
    relations: {
      account: { foreignKey: 'accountId', target: 'agent_crm_accounts' },
      owner: { foreignKey: 'ownerId', target: 'user' },
    },
    defaults: { stage: 'discovery', probability: 20 },
  },
  agent_crm_activities: {
    editable: [
      'subject',
      'type',
      'status',
      'dueAt',
      'opportunityId',
      'contactId',
      'ownerId',
      'notes',
    ],
    required: ['subject', 'type', 'status', 'dueAt'],
    searchable: ['subject', 'type', 'status'],
    relations: {
      opportunity: {
        foreignKey: 'opportunityId',
        target: 'agent_crm_opportunities',
      },
      contact: { foreignKey: 'contactId', target: 'agent_crm_contacts' },
    },
    defaults: { type: 'task', status: 'planned' },
  },
};

const userFields = [
  'id',
  'name',
  'username',
  'email',
  'image',
  'createdAt',
  'updatedAt',
] as const;
const baseFields = ['id', 'createdAt', 'updatedAt'] as const;

export class CrmServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { status: number; code: string }) {
    super(message);
    this.name = 'CrmServiceError';
    this.status = options.status;
    this.code = options.code;
  }
}

export function createCrmService(database: DatabaseManager): CrmService {
  return new DatabaseCrmService(database);
}

class DatabaseCrmService implements CrmService {
  constructor(private readonly database: DatabaseManager) {}

  async list(
    resource: CrmApiResourceName,
    options: CrmListOptions = {},
  ): Promise<CrmListResult> {
    const knex = await this.database.connection().client<Knex>();
    const fields = fieldsFor(resource);
    let query = knex(resource).select(fields);
    query = applyFilter(query, resource, options.filter);

    const countRow = await applyFilter(knex(resource), resource, options.filter)
      .count<{ count: number | string }>({ count: '*' })
      .first();
    const count = Number(countRow?.count ?? 0);

    for (const sorter of parseSort(options.sort)) {
      assertField(resource, sorter.field);
      query.orderBy(sorter.field, sorter.direction);
    }
    if (!parseSort(options.sort).length) query.orderBy('updatedAt', 'desc');

    const pageSize = clampInteger(options.pageSize, 10, 1, 100);
    const page = clampInteger(options.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const rows = (await query
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as CrmRecord[];
    return {
      rows: await this.appendRelations(resource, rows, options.appends),
      count,
    };
  }

  async get(
    resource: CrmApiResourceName,
    id: string | number,
    appends: string[] = [],
  ): Promise<CrmRecord | undefined> {
    const knex = await this.database.connection().client<Knex>();
    const record = (await knex(resource)
      .select(fieldsFor(resource))
      .where('id', normalizeId(id))
      .first()) as CrmRecord | undefined;
    if (!record) return undefined;
    return (await this.appendRelations(resource, [record], appends))[0];
  }

  async create(
    resource: CrmResourceName,
    values: unknown,
    actor: AuthSession,
  ): Promise<CrmRecord> {
    const knex = await this.database.connection().client<Knex>();
    const now = new Date().toISOString();
    const data = normalizeWrite(resource, values, actor, 'create');
    if (resource === 'agent_crm_leads') {
      data.code = `LEAD-${now.slice(0, 7).replace('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    }
    const rows = await knex(resource)
      .insert({ ...data, createdAt: now, updatedAt: now })
      .returning('id');
    const id = extractInsertedId(rows);
    return requireRecord(await this.get(resource, id), resource, id);
  }

  async update(
    resource: CrmResourceName,
    id: string | number,
    values: unknown,
    actor: AuthSession,
  ): Promise<CrmRecord> {
    const current = await this.get(resource, id);
    if (!current) throw notFound(resource, id);
    const data = normalizeWrite(resource, values, actor, 'update');
    const knex = await this.database.connection().client<Knex>();
    await knex(resource)
      .where('id', normalizeId(id))
      .update({ ...data, updatedAt: new Date().toISOString() });
    return requireRecord(await this.get(resource, id), resource, id);
  }

  async destroy(
    resource: CrmResourceName,
    id: string | number,
  ): Promise<CrmRecord> {
    const current = await this.get(resource, id);
    if (!current) throw notFound(resource, id);
    const knex = await this.database.connection().client<Knex>();
    await knex(resource).where('id', normalizeId(id)).delete();
    return current;
  }

  async query(
    resource: CrmResourceName,
    request: CrmQueryRequest,
  ): Promise<CrmRecord[]> {
    const knex = await this.database.connection().client<Knex>();
    const measures = parseMeasures(resource, request.measures);
    const dimensions = parseDimensions(resource, request.dimensions);
    if (!measures.length) {
      throw new CrmServiceError('At least one measure is required.', {
        status: 400,
        code: 'CRM_QUERY_MEASURE_REQUIRED',
      });
    }

    let query = knex(resource);
    query = applyFilter(query, resource, request.filter);
    for (const dimension of dimensions) {
      query
        .select({ [dimension.alias]: dimension.field })
        .groupBy(dimension.field);
    }
    for (const measure of measures) {
      if (measure.aggregation === 'count')
        query.count({ [measure.alias]: measure.field });
      else query.sum({ [measure.alias]: measure.field });
    }
    for (const order of parseQueryOrders(
      request.orders,
      measures,
      dimensions,
    )) {
      query.orderBy(order.field, order.direction);
    }
    query.limit(clampInteger(request.limit, 100, 1, 500));
    query.offset(clampInteger(request.offset, 0, 0, Number.MAX_SAFE_INTEGER));
    return (await query) as CrmRecord[];
  }

  private async appendRelations(
    resource: CrmApiResourceName,
    rows: CrmRecord[],
    requested: string[] = [],
  ): Promise<CrmRecord[]> {
    if (resource === 'user' || !rows.length || !requested.length) return rows;
    const definition = resourceDefinitions[resource];
    const appends = [...new Set(requested)].filter(
      (name) => definition.relations[name],
    );
    if (!appends.length) return rows;
    const knex = await this.database.connection().client<Knex>();
    const maps = new Map<string, Map<string, CrmRecord>>();

    for (const append of appends) {
      const relation = definition.relations[append];
      const ids = [
        ...new Set(rows.map((row) => row[relation.foreignKey]).filter(isKey)),
      ];
      if (!ids.length) {
        maps.set(append, new Map());
        continue;
      }
      const related = (await knex(relation.target)
        .select(fieldsFor(relation.target))
        .whereIn('id', ids)) as CrmRecord[];
      maps.set(
        append,
        new Map(related.map((record) => [String(record.id), record])),
      );
    }

    return rows.map((row) => {
      const next: CrmRecord = { ...row };
      for (const append of appends) {
        const relation = definition.relations[append];
        const key = row[relation.foreignKey];
        next[append] = isKey(key)
          ? (maps.get(append)?.get(String(key)) ?? null)
          : null;
      }
      return next;
    });
  }
}

function fieldsFor(resource: CrmApiResourceName): readonly string[] {
  if (resource === 'user') return userFields;
  return [
    ...baseFields,
    ...resourceDefinitions[resource].editable,
    ...(resource === 'agent_crm_leads' ? ['code'] : []),
  ];
}

function assertField(resource: CrmApiResourceName, field: string): void {
  if (!fieldsFor(resource).includes(field)) {
    throw new CrmServiceError(`Unknown field ${field} for ${resource}.`, {
      status: 400,
      code: 'CRM_FIELD_INVALID',
    });
  }
}

function parseSort(
  value: string | undefined,
): Array<{ field: string; direction: 'asc' | 'desc' }> {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({
      field: item.replace(/^-/, ''),
      direction: item.startsWith('-') ? 'desc' : 'asc',
    }));
}

function applyFilter<T extends Knex.QueryBuilder>(
  query: T,
  resource: CrmApiResourceName,
  rawFilter: unknown,
): T {
  const filter = asRecord(rawFilter);
  if (!filter) return query;
  query.where((builder) => applyFilterGroup(builder, resource, filter));
  return query;
}

function applyFilterGroup(
  builder: Knex.QueryBuilder,
  resource: CrmApiResourceName,
  filter: Record<string, unknown>,
): void {
  for (const [field, condition] of Object.entries(filter)) {
    if (field === '$and' || field === '$or') {
      const items = Array.isArray(condition)
        ? condition
            .map(asRecord)
            .filter((item): item is Record<string, unknown> => Boolean(item))
        : [];
      builder.where((group) => {
        items.forEach((item, index) => {
          const method = field === '$or' && index > 0 ? 'orWhere' : 'andWhere';
          group[method]((nested) => applyFilterGroup(nested, resource, item));
        });
      });
      continue;
    }
    assertField(resource, field);
    const operators = asRecord(condition) ?? { $eq: condition };
    for (const [operator, value] of Object.entries(operators)) {
      applyOperator(builder, field, operator, value);
    }
  }
}

function applyOperator(
  query: Knex.QueryBuilder,
  field: string,
  operator: string,
  value: unknown,
): void {
  if (operator === '$eq') query.where(field, value as Knex.Value);
  else if (operator === '$ne') query.whereNot(field, value as Knex.Value);
  else if (operator === '$in') query.whereIn(field, arrayValue(value));
  else if (operator === '$notIn') query.whereNotIn(field, arrayValue(value));
  else if (operator === '$includes')
    query.where(field, 'like', `%${filterTextValue(value)}%`);
  else if (operator === '$startsWith')
    query.where(field, 'like', `${filterTextValue(value)}%`);
  else if (operator === '$endsWith')
    query.where(field, 'like', `%${filterTextValue(value)}`);
  else if (operator === '$null') query.whereNull(field);
  else if (operator === '$notNull') query.whereNotNull(field);
  else if (operator === '$lt') query.where(field, '<', value as Knex.Value);
  else if (operator === '$lte') query.where(field, '<=', value as Knex.Value);
  else if (operator === '$gt') query.where(field, '>', value as Knex.Value);
  else if (operator === '$gte') query.where(field, '>=', value as Knex.Value);
  else {
    throw new CrmServiceError(`Unsupported filter operator ${operator}.`, {
      status: 400,
      code: 'CRM_FILTER_INVALID',
    });
  }
}

function normalizeWrite(
  resource: CrmResourceName,
  values: unknown,
  actor: AuthSession,
  mode: 'create' | 'update',
): Record<string, unknown> {
  const input = asRecord(values);
  if (!input) {
    throw new CrmServiceError('Request body must be a JSON object.', {
      status: 400,
      code: 'CRM_BODY_INVALID',
    });
  }
  const definition = resourceDefinitions[resource];
  const data: Record<string, unknown> =
    mode === 'create' ? { ...definition.defaults } : {};
  for (const field of definition.editable) {
    if (Object.hasOwn(input, field))
      data[field] = normalizeScalar(input[field]);
  }
  for (const [name, relation] of Object.entries(definition.relations)) {
    if (!Object.hasOwn(input, name)) continue;
    const relationValue = asRecord(input[name]);
    data[relation.foreignKey] = normalizeScalar(
      relationValue?.id ?? input[name],
    );
  }
  if (mode === 'create' && actor?.user.id) {
    if (definition.editable.includes('ownerId') && !data.ownerId)
      data.ownerId = actor.user.id;
  }
  if (mode === 'create') {
    for (const field of definition.required) {
      if (
        data[field] === undefined ||
        data[field] === null ||
        data[field] === ''
      ) {
        throw new CrmServiceError(`${field} is required.`, {
          status: 422,
          code: 'CRM_VALIDATION_FAILED',
        });
      }
    }
  }
  validateBusinessValues(resource, data);
  return data;
}

function validateBusinessValues(
  resource: CrmResourceName,
  data: Record<string, unknown>,
): void {
  if (resource === 'agent_crm_leads' && data.score !== undefined) {
    assertNumberRange(data.score, 'score', 0, 100);
  }
  if (resource === 'agent_crm_opportunities') {
    if (data.amount !== undefined)
      assertNumberRange(data.amount, 'amount', 0, Number.MAX_SAFE_INTEGER);
    if (data.probability !== undefined)
      assertNumberRange(data.probability, 'probability', 0, 100);
  }
}

function assertNumberRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): void {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new CrmServiceError(`${field} must be between ${min} and ${max}.`, {
      status: 422,
      code: 'CRM_VALIDATION_FAILED',
    });
  }
}

type ParsedMeasure = {
  field: string;
  aggregation: 'count' | 'sum';
  alias: string;
};
type ParsedDimension = { field: string; alias: string };

function parseMeasures(
  resource: CrmResourceName,
  value: unknown,
): ParsedMeasure[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = asRecord(item) ?? {};
    const field = fieldPath(record.field);
    const aggregation = record.aggregation;
    const alias = validAlias(record.alias, `${String(aggregation)}_${field}`);
    assertField(resource, field);
    if (aggregation !== 'count' && aggregation !== 'sum') {
      throw new CrmServiceError(
        'Only count and sum aggregations are supported.',
        {
          status: 400,
          code: 'CRM_QUERY_INVALID',
        },
      );
    }
    return { field, aggregation, alias };
  });
}

function parseDimensions(
  resource: CrmResourceName,
  value: unknown,
): ParsedDimension[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = asRecord(item) ?? {};
    const field = fieldPath(record.field);
    assertField(resource, field);
    return { field, alias: validAlias(record.alias, field) };
  });
}

function parseQueryOrders(
  value: unknown,
  measures: ParsedMeasure[],
  dimensions: ParsedDimension[],
): Array<{ field: string; direction: 'asc' | 'desc' }> {
  if (!Array.isArray(value)) return [];
  const aliases = new Set([
    ...measures.map((item) => item.alias),
    ...dimensions.map((item) => item.alias),
  ]);
  return value.map((item) => {
    const record = asRecord(item) ?? {};
    const candidate =
      typeof record.alias === 'string' ? record.alias : fieldPath(record.field);
    if (!aliases.has(candidate)) {
      throw new CrmServiceError(`Unknown query order ${candidate}.`, {
        status: 400,
        code: 'CRM_QUERY_INVALID',
      });
    }
    return {
      field: candidate,
      direction: record.order === 'desc' ? 'desc' : 'asc',
    };
  });
}

function fieldPath(value: unknown): string {
  const field: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
  if (typeof field !== 'string' || !field) {
    throw new CrmServiceError('Query field is required.', {
      status: 400,
      code: 'CRM_QUERY_INVALID',
    });
  }
  return field;
}

function validAlias(value: unknown, fallback: string): string {
  const alias = typeof value === 'string' && value ? value : fallback;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new CrmServiceError(`Invalid query alias ${alias}.`, {
      status: 400,
      code: 'CRM_QUERY_INVALID',
    });
  }
  return alias;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeScalar(value: unknown): unknown {
  if (value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeId(value: string | number): string | number {
  const number = Number(value);
  return Number.isSafeInteger(number) && String(number) === String(value)
    ? number
    : value;
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const number = Number(value);
  return Number.isSafeInteger(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
}

function arrayValue(value: unknown): Knex.Value[] {
  return Array.isArray(value) ? (value as Knex.Value[]) : [value as Knex.Value];
}

function isKey(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

function extractInsertedId(rows: unknown): string | number {
  const first: unknown = Array.isArray(rows) ? (rows as unknown[])[0] : rows;
  if (typeof first === 'string' || typeof first === 'number') return first;
  const record = asRecord(first);
  if (typeof record?.id === 'string' || typeof record?.id === 'number')
    return record.id;
  throw new CrmServiceError('Database did not return the created record id.', {
    status: 500,
    code: 'CRM_CREATE_FAILED',
  });
}

function filterTextValue(value: unknown): string {
  if (value == null) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  throw new CrmServiceError('Text filter value must be a scalar.', {
    status: 400,
    code: 'CRM_FILTER_INVALID',
  });
}

function requireRecord(
  record: CrmRecord | undefined,
  resource: CrmApiResourceName,
  id: string | number,
): CrmRecord {
  if (!record) throw notFound(resource, id);
  return record;
}

function notFound(
  resource: CrmApiResourceName,
  id: string | number,
): CrmServiceError {
  return new CrmServiceError(`${resource} record ${id} was not found.`, {
    status: 404,
    code: 'CRM_RECORD_NOT_FOUND',
  });
}

export function isCrmResource(value: string): value is CrmResourceName {
  return (CRM_RESOURCES as readonly string[]).includes(value);
}

export function isCrmApiResource(value: string): value is CrmApiResourceName {
  return value === 'user' || isCrmResource(value);
}

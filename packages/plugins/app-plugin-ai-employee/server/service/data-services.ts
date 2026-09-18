import type {
  AppAuthorizationService,
  DatabaseAuthorizationConditions,
  DatabaseAuthorizationParams,
} from '@nocobase/app-plugin-authorization/server';
import type {
  FieldDefinition,
  CollectionDefinition,
  ReadNode,
  RelationFieldDefinition,
  RepositoryPolicy,
  FilterAst,
  SelectIncludeNode,
} from '@nocobase/db';
import type {
  CreateDataServicesOptions,
  DataAggregateInput,
  DataAggregateResult,
  DataCollectionSummary,
  DataFieldMatch,
  DataFieldSummary,
  DataFilterInput,
  DataMetadataInput,
  DataMetadataResult,
  DataPage,
  DataPageInput,
  DataRowsInput,
  DataRowsResult,
  DataSearchInput,
  DataServices,
  DataSourceInput,
  DataSourceSummary,
} from './data-contracts.js';
import {
  dataQuerySchema,
  dataSourceCountingSchema,
  dataSourceQuerySchema,
  getCollectionMetadataSchema,
  getCollectionNamesSchema,
  getDataSourcesSchema,
  searchFieldMetadataSchema,
} from './data-schemas.js';
import { DataAccessError, dataFilter, dataSort } from './data-query-policy.js';
import { dataOutput } from './data-output.js';
import { parseDataInput } from './data-validation.js';

interface Access {
  source: string;
  name: string;
  definition: CollectionDefinition;
  fields: (FieldDefinition | RelationFieldDefinition)[];
  allowed: Set<string>;
  read: ReadNode & { scope: true | FilterAst };
  relations: DatabaseAuthorizationConditions['relations'];
}
const safeName = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const unsupportedNames = new Set(['__proto__', 'prototype', 'constructor']);
const scalarTypes = new Set([
  'increments',
  'integer',
  'bigInt',
  'decimal',
  'float',
  'double',
  'string',
  'char',
  'text',
  'enum',
  'uuid',
  'boolean',
  'date',
  'time',
  'datetime',
  'datetimeTz',
]);

/** Bind identity once. Roles, root flags, resources, and scopes never come from tool arguments. */
export function createDataServices(
  options: CreateDataServicesOptions,
): DataServices {
  return new ActorDataServices(options);
}

class ActorDataServices implements DataServices {
  private readonly authorization?: AppAuthorizationService;
  private readonly principalId: string;
  private get timezone(): string {
    return this.options.timezone ?? 'UTC';
  }
  constructor(private readonly options: CreateDataServicesOptions) {
    this.authorization = options.authorization;
    this.principalId =
      typeof options.actor.id === 'number' &&
      !Number.isSafeInteger(options.actor.id)
        ? ''
        : String(options.actor.id);
  }

  private requireAuthorization(): AppAuthorizationService {
    if (
      !this.authorization ||
      !this.principalId.trim() ||
      this.principalId.length > 256
    )
      throw new DataAccessError();
    return this.authorization;
  }

  private mappings(): Array<{ source: string; name: string }> {
    const registered = this.requireAuthorization().db.collections.list();
    if (registered.length > 1000)
      throw new DataAccessError('Data catalog exceeds the supported size');
    return registered
      .flatMap((item) => {
        const parts = item.name.split('.');
        return parts.length === 2 &&
          parts.every(
            (part) => safeName.test(part) && !unsupportedNames.has(part),
          ) &&
          this.requireAuthorization().db.collections.actionRegistry.resolve(
            item.name,
            'read',
          )
          ? [{ source: parts[0], name: parts[1] }]
          : [];
      })
      .sort((left, right) =>
        `${left.source}.${left.name}`.localeCompare(
          `${right.source}.${right.name}`,
        ),
      );
  }

  private async access(
    source: string,
    name: string,
    requested: readonly string[] = [],
  ): Promise<Access> {
    const authz = this.requireAuthorization();
    const resourceId = `${source}.${name}`;
    const registered = authz.db.collections
      .list()
      .find((item) => item.name === resourceId);
    if (
      !registered ||
      registered.name !== resourceId ||
      !authz.db.collections.actionRegistry.resolve(resourceId, 'read')
    )
      throw new DataAccessError();
    const decision = await authz
      .for({
        principal: { type: 'user', id: this.principalId },
        subjects: [{ type: 'authenticated', id: '*' }],
      })
      .authorize<DatabaseAuthorizationParams>({
        resource: { type: 'database.collection', id: resourceId },
        action: 'read',
        params: { fields: { output: [...new Set(requested)] } },
      });
    if (
      decision.effect !== 'conditional' ||
      decision.conditions?.type !== 'database'
    )
      throw new DataAccessError();
    const conditions = decision.conditions as DatabaseAuthorizationConditions;
    if (
      conditions.collection !== resourceId ||
      conditions.action !== 'read' ||
      !conditions.fields ||
      conditions.scope === undefined
    )
      throw new DataAccessError();
    const allowed = new Set(
      [...conditions.fields, ...Object.keys(conditions.relations ?? {})].filter(
        (field) => safeName.test(field) && !unsupportedNames.has(field),
      ),
    );
    if (requested.some((field) => !allowed.has(field)))
      throw new DataAccessError('Requested fields are not authorized');
    // Only explicitly registered resources reach metadata resolution. Never scan physical tables.
    let definition: CollectionDefinition | undefined;
    try {
      definition = await this.options.database.collections(source).get(name);
    } catch {
      throw new DataAccessError();
    }
    if (!definition || (definition.fields?.length ?? 0) > 500)
      throw new DataAccessError();
    const fields = definition.fields ?? [];
    if (
      requested.some(
        (field) => !fields.some((candidate) => candidate.name === field),
      )
    )
      throw new DataAccessError('Requested fields are unavailable');
    const outputFields = fields
      .filter(
        (field) =>
          !field.target &&
          scalarTypes.has(field.type) &&
          allowed.has(field.name),
      )
      .map((field) => field.name);
    return {
      source,
      name,
      definition,
      fields,
      allowed,
      relations: conditions.relations,
      read: {
        scope:
          conditions.scope === true
            ? true
            : { ...conditions.scope, collection: name },
        fields: outputFields,
        relations: false,
      },
    };
  }

  private async visibleAccess(
    source: string,
    name: string,
  ): Promise<Access | undefined> {
    try {
      return await this.access(source, name);
    } catch (error) {
      if (error instanceof DataAccessError) return undefined;
      throw error;
    }
  }

  private assertScalars(access: Access, fields: readonly string[]): void {
    if (
      fields.some(
        (name) =>
          !access.allowed.has(name) ||
          !access.fields.some(
            (field) =>
              field.name === name &&
              !field.target &&
              scalarTypes.has(field.type),
          ),
      )
    )
      throw new DataAccessError('Requested scalar fields are unavailable');
  }

  private async relation(
    access: Access,
    name: string,
  ): Promise<{ field: RelationFieldDefinition; target: Access } | undefined> {
    const field = access.fields.find((candidate) => candidate.name === name);
    if (!field?.target || !access.allowed.has(name)) return undefined;
    if (
      !safeName.test(field.target) ||
      field.type === 'belongsToMany' ||
      !field.foreignKey
    )
      return undefined;
    // Require explicit join metadata rather than guessing Repository's implicit keys.
    const sourceKey =
      field.type === 'belongsTo' ? field.foreignKey : field.sourceKey;
    const targetKey =
      field.type === 'belongsTo' ? field.targetKey : field.foreignKey;
    if (!sourceKey || !targetKey) return undefined;
    const target = await this.visibleAccess(access.source, field.target);
    if (!target) return undefined;
    const relation = access.relations?.[name];
    if (!relation || !('fields' in relation)) return undefined;
    const targetScope = target.read.scope;
    const scope =
      relation.scope === true
        ? targetScope
        : targetScope === true
          ? { ...relation.scope, collection: target.name }
          : {
              kind: 'filter' as const,
              version: 1 as const,
              collection: target.name,
              root: {
                kind: 'group' as const,
                logic: 'and' as const,
                items: [relation.scope.root, targetScope.root],
              },
            };
    const fields = relation.fields.filter((field) => target.allowed.has(field));
    target.allowed = new Set(fields);
    target.read = { ...target.read, scope, fields, relations: false };
    try {
      this.assertScalars(access, [sourceKey]);
      this.assertScalars(target, [targetKey]);
    } catch {
      return undefined;
    }
    return { field: field, target };
  }

  private summary(access: Access): DataCollectionSummary {
    return { name: access.name, ...descriptions(access.definition) };
  }

  private async metadataFields(access: Access): Promise<DataFieldSummary[]> {
    const results: DataFieldSummary[] = [];
    for (const field of access.fields) {
      if (!access.allowed.has(field.name)) continue;
      if (field.target) {
        const relation = await this.relation(access, field.name);
        if (relation)
          results.push({
            name: field.name,
            type: field.type,
            ...descriptions(field),
            relation: {
              target: relation.target.name,
              cardinality: field.type === 'hasMany' ? 'many' : 'one',
              queryable: true,
            },
          });
      } else if (scalarTypes.has(field.type))
        results.push({
          name: field.name,
          type: field.type,
          ...descriptions(field),
          ...(field.nullable === undefined ? {} : { nullable: field.nullable }),
        });
    }
    return results.sort((left, right) => left.name.localeCompare(right.name));
  }

  async getDataSources(
    raw: DataPageInput,
  ): Promise<DataPage<DataSourceSummary>> {
    const input = parseDataInput(getDataSourcesSchema, raw);
    const sources = new Set<string>();
    for (const mapping of this.mappings()) {
      if (
        !sources.has(mapping.source) &&
        (await this.visibleAccess(mapping.source, mapping.name))
      )
        sources.add(mapping.source);
    }
    return page(
      [...sources].map((name) => ({ name })),
      input,
    );
  }

  async getCollectionNames(
    raw: DataSourceInput,
  ): Promise<DataPage<DataCollectionSummary>> {
    const input = parseDataInput(getCollectionNamesSchema, raw);
    const items: DataCollectionSummary[] = [];
    for (const mapping of this.mappings().filter(
      (item) => item.source === (input.dataSource ?? 'main'),
    )) {
      const access = await this.visibleAccess(mapping.source, mapping.name);
      if (access) items.push(this.summary(access));
    }
    return page(items, input);
  }

  async getCollectionMetadata(
    raw: DataMetadataInput,
  ): Promise<DataMetadataResult> {
    const input = parseDataInput(getCollectionMetadataSchema, raw);
    const access = await this.access(
      input.dataSource ?? 'main',
      input.collection,
    );
    return {
      ...this.summary(access),
      dataSource: access.source,
      fields: page(await this.metadataFields(access), input),
    };
  }

  async searchFieldMetadata(
    raw: DataSearchInput,
  ): Promise<DataPage<DataFieldMatch>> {
    const input = parseDataInput(searchFieldMetadataSchema, raw);
    const items: DataFieldMatch[] = [];
    const query = input.query.toLocaleLowerCase('en');
    for (const mapping of this.mappings().filter(
      (item) =>
        item.source === (input.dataSource ?? 'main') &&
        (!input.collection || item.name === input.collection),
    )) {
      const access = await this.visibleAccess(mapping.source, mapping.name);
      if (!access) continue;
      for (const field of await this.metadataFields(access)) {
        const values = [field.name, field.title, field.description]
          .filter((value): value is string => value !== undefined)
          .map((value) => value.toLocaleLowerCase('en'));
        if (values.some((value) => value.includes(query)))
          items.push({
            ...field,
            collection: access.name,
            match: values.some((value) => value === query)
              ? 'exact'
              : 'candidate',
          });
      }
      if (items.length > 10000)
        throw new DataAccessError('Search is too broad; select a collection');
    }
    items.sort(
      (left, right) =>
        Number(left.match !== 'exact') - Number(right.match !== 'exact'),
    );
    return page(items, input);
  }

  private assertTimezone(): void {
    // This labels the trusted execution context; predicates remain native exact
    // dates/timestamps. Never silently reinterpret a local day as UTC.
    try {
      if (this.timezone.length > 100) throw new Error('Invalid timezone');
      new Intl.DateTimeFormat('en', { timeZone: this.timezone });
    } catch {
      throw new DataAccessError(
        'Invalid execution timezone; use a valid IANA timezone and explicit timestamp boundaries',
      );
    }
  }

  private repository(
    access: Access,
    relations: Readonly<Record<string, ReadNode>> = {},
  ) {
    const policy: RepositoryPolicy = {
      read: { ...access.read, relations },
      create: false,
      update: false,
      delete: false,
    };
    return this.options.database
      .repository(access.name, access.source)
      .withPolicy(policy);
  }

  async dataSourceQuery(raw: DataRowsInput): Promise<DataRowsResult> {
    const input = parseDataInput(dataSourceQuerySchema, raw);
    this.assertTimezone();
    const used = [
      ...input.fields,
      ...(input.filter?.map((item) => item.field) ?? []),
      ...(input.sort?.map((item) => item.field) ?? []),
    ];
    const access = await this.access(
      input.dataSource ?? 'main',
      input.collection,
      used,
    );
    this.assertScalars(access, used);
    const includes: SelectIncludeNode[] = [];
    const relations: Record<string, ReadNode> = {};
    for (const requested of input.relations ?? []) {
      if (Object.hasOwn(relations, requested.relation))
        throw new DataAccessError('Duplicate relation');
      const relation = await this.relation(access, requested.relation);
      if (!relation)
        throw new DataAccessError(
          'Relation is unavailable; only explicit one-hop non-through relations are supported',
        );
      this.assertScalars(relation.target, requested.fields);
      relations[requested.relation] = relation.target.read;
      includes.push({
        kind: 'include',
        relation: requested.relation,
        select: { kind: 'selection', fields: requested.fields },
        limit: requested.limit ?? 5,
      });
    }
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const rows = await this.repository(access, relations).findMany({
      select: {
        kind: 'select',
        version: 1,
        root: { kind: 'selection', fields: input.fields, includes },
      },
      filter: dataFilter(input.filter ?? [], access.fields),
      ...(input.sort?.length ? { sort: dataSort(input.sort) } : {}),
      limit: limit + 1,
      offset,
    });
    return {
      ...dataOutput(rows.slice(0, limit)),
      limit,
      offset,
      hasMore: rows.length > limit,
      timezone: this.timezone,
    };
  }

  async dataSourceCounting(raw: DataFilterInput): Promise<{ count: number }> {
    const input = parseDataInput(dataSourceCountingSchema, raw);
    this.assertTimezone();
    const used = input.filter?.map((item) => item.field) ?? [];
    const access = await this.access(
      input.dataSource ?? 'main',
      input.collection,
      used,
    );
    this.assertScalars(access, used);
    const count = await this.repository(access).count({
      filter: dataFilter(input.filter ?? [], access.fields),
    });
    if (!Number.isSafeInteger(count) || count < 0)
      throw new DataAccessError('Count exceeds exact integer range');
    return { count };
  }

  async dataQuery(raw: DataAggregateInput): Promise<DataAggregateResult> {
    const input = parseDataInput(dataQuerySchema, raw);
    this.assertTimezone();
    const used = [
      ...(input.filter?.map((item) => item.field) ?? []),
      ...input.aggregates.flatMap((item) => (item.field ? [item.field] : [])),
      ...(input.groupBy?.map((item) => item.field) ?? []),
    ];
    const access = await this.access(
      input.dataSource ?? 'main',
      input.collection,
      used,
    );
    this.assertScalars(access, used);
    const repository = this.repository(access);
    const aggregate = {
      kind: 'aggregate' as const,
      version: 1 as const,
      items: input.aggregates.map((item) =>
        item.function === 'count'
          ? {
              kind: item.function,
              alias: item.alias,
              ...(item.field ? { field: item.field } : {}),
            }
          : { kind: item.function, alias: item.alias, field: item.field },
      ),
    };
    const filter = dataFilter(
      [
        ...(input.filter ?? []),
        ...(input.groupBy?.map((group) => ({
          field: group.field,
          operator: 'in' as const,
          value: group.values,
        })) ?? []),
      ],
      access.fields,
    );
    const groups = input.groupBy?.map((group) => group.field);
    const rows = groups?.length
      ? await repository.groupBy({
          by: [groups[0], ...groups.slice(1)],
          aggregate,
          filter,
          ...(input.sort?.length ? { sort: dataSort(input.sort) } : {}),
        })
      : [await repository.aggregate({ aggregate, filter })];
    if (rows.length > 100)
      throw new DataAccessError('Grouped result exceeds the supported bound');
    return { ...dataOutput(rows), timezone: this.timezone };
  }
}

function page<T>(items: T[], input: DataPageInput): DataPage<T> {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  return {
    items: items.slice(offset, offset + limit),
    limit,
    offset,
    hasMore: items.length > offset + limit,
  };
}
function descriptions(value: { title?: string; description?: string }): {
  title?: string;
  description?: string;
} {
  return {
    ...(value.title ? { title: value.title.slice(0, 256) } : {}),
    ...(value.description
      ? { description: value.description.slice(0, 512) }
      : {}),
  };
}

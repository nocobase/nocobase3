import type {
  AccessConstraint,
  AccessConstraintService,
  AuthorizationDecision,
  AuthorizationGrant,
  AuthorizationGrantService,
  AuthorizationRequest,
  Principal,
} from '../../core/index.js';
import { DatabaseCollectionRegistry } from './collection-registry.js';
import {
  databaseCollectionFieldsKnown,
  databaseFieldsAllowed,
  resolveDatabaseFields,
} from './field-access.js';
import type {
  DatabaseActionGrant,
  DatabaseAuthorizationPolicy,
  DatabaseAuthorizationParams,
  DatabaseCollectionDefinition,
  DatabaseAuthorizationConditions,
  DatabaseRecordAccess,
  DatabaseRecordAccessConfig,
} from './model.js';
import {
  andFilters,
  assertDatabaseFilter,
  isNoRecordsFilter,
  orFilters,
  type DatabaseFilter,
} from './filter.js';
import { RecordAccessPolicyRegistry } from './record-access-registry.js';

export interface DatabaseResourceAuthorizerOptions {
  collections: DatabaseCollectionRegistry;
  recordAccess: RecordAccessPolicyRegistry;
}

export class DatabaseResourceAuthorizer {
  private readonly collections: DatabaseCollectionRegistry;
  private readonly recordAccess: RecordAccessPolicyRegistry;

  constructor(options: DatabaseResourceAuthorizerOptions) {
    this.collections = options.collections;
    this.recordAccess = options.recordAccess;
  }

  async authorize(
    request: AuthorizationRequest<DatabaseAuthorizationParams>,
    grantsService: AuthorizationGrantService,
    constraintsService: AccessConstraintService,
  ): Promise<AuthorizationDecision> {
    const resourceId = this.collections.resolveName(request.resource.id);
    const resource = this.collections.get(resourceId);
    if (!resource || !resource.actions.includes(request.action)) {
      return this.deny(
        'UNKNOWN_DATABASE_RESOURCE_OR_ACTION',
        `Unknown database resource or action: ${resourceId}.${request.action}`,
      );
    }
    const params = request.params;
    if (!databaseCollectionFieldsKnown(resource, params?.fields)) {
      return this.deny(
        'UNKNOWN_DATABASE_FIELD',
        `One or more requested fields are not registered for ${resourceId}`,
      );
    }
    const grants = await grantsService.resolve({
      principal: request.principal,
      subjects: request.subjects,
      resource: { type: 'database.collection', id: resourceId },
      action: request.action,
    });
    const configs = grants.flatMap(toDatabaseGrant);
    if (configs.length === 0) {
      return this.deny(
        'NO_OBJECT_PERMISSION',
        `No database grant allows ${resourceId}.${request.action}`,
      );
    }
    const fields = resolveDatabaseFields(configs);
    if (!databaseFieldsAllowed(params?.fields, fields)) {
      return this.deny(
        'FIELD_NOT_ALLOWED',
        'One or more input, output, filter, sort, or group fields are not allowed',
      );
    }
    const reasons = grants.map((grant) => ({
      code: 'GRANT_MATCHED',
      message: `${grant.source.plugin}:${grant.source.id} allows ${resourceId}.${request.action}`,
      plugin: 'database',
    }));
    if (request.action === 'create') return { effect: 'permit', reasons };

    try {
      const filter = await this.resolveEffectiveFilter(
        request.principal,
        resource,
        request.action,
        configs,
        await constraintsService.resolve({
          principal: request.principal,
          subjects: request.subjects,
          resource: { type: 'database.collection', id: resourceId },
          action: request.action,
        }),
      );
      if (isNoRecordsFilter(filter)) {
        return this.deny(
          'NO_RECORD_ACCESS',
          'No Record Access allows this action',
        );
      }
      const conditions: DatabaseAuthorizationConditions = {
        type: 'database',
        collection: resourceId,
        action: request.action,
        filter,
        fields,
      };
      return {
        effect: 'conditional',
        conditions,
        reasons,
      };
    } catch (error) {
      return this.deny(
        'DATABASE_AUTHORIZATION_FAILED',
        error instanceof Error
          ? error.message
          : 'Database authorization failed',
      );
    }
  }

  private async resolveEffectiveFilter(
    principal: Principal,
    resource: DatabaseCollectionDefinition,
    action: string,
    configs: readonly DatabaseActionGrant[],
    constraints: readonly AccessConstraint[],
  ): Promise<DatabaseFilter> {
    const scopes = configs.flatMap((config) => config.recordAccess ?? []);
    const positive = await this.compileScopes(
      principal,
      resource,
      action,
      scopes,
    );
    positive.push(
      ...(await this.compileConstraints(
        constraints.filter((constraint) => constraint.effect === 'expand'),
        principal,
        resource,
        action,
      )),
    );
    const restrictions = await this.compileConstraints(
      constraints.filter((constraint) => constraint.effect === 'restrict'),
      principal,
      resource,
      action,
    );
    return andFilters([orFilters(positive), ...restrictions]);
  }

  private async compileConstraints(
    constraints: readonly AccessConstraint[],
    principal: Principal,
    resource: DatabaseCollectionDefinition,
    action: string,
  ): Promise<DatabaseFilter[]> {
    const filters: DatabaseFilter[] = [];
    for (const constraint of constraints) {
      const value = constraint.value;
      if (value.type === 'all') {
        filters.push({ $and: [] });
        continue;
      }
      if (value.type === 'ids') {
        const ids = 'ids' in value ? value.ids : undefined;
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
          throw new Error('Invalid IDs access scope');
        }
        filters.push({
          $and: [
            {
              [resource.attributes?.identifier ?? 'id']: { $in: ids },
            },
          ],
        });
        continue;
      }
      if (value.type !== 'database') {
        throw new Error(`Unsupported database access scope: ${value.type}`);
      }
      const recordAccess = value.recordAccess;
      if (!isDatabaseRecordAccess(recordAccess)) {
        throw new Error('Invalid database Record Access scope');
      }
      filters.push(
        ...(await this.compileScopes(principal, resource, action, [
          recordAccess,
        ])),
      );
    }
    return filters;
  }

  private async compileScopes(
    principal: Principal,
    resource: DatabaseCollectionDefinition,
    action: string,
    scopes: readonly DatabaseRecordAccess[],
  ): Promise<DatabaseFilter[]> {
    const filters: DatabaseFilter[] = [];
    for (const scope of scopes) {
      const config = normalizeRecordAccess(scope);
      const policy = this.recordAccess.get(config.key);
      if (!policy) {
        throw new Error(`Unknown Record Access policy: ${config.key}`);
      }
      const filter = await policy.resolve({
        principal,
        collection: resource,
        action,
        params: config.params,
      });
      assertDatabaseFilter(filter, resource.fields);
      filters.push(filter);
    }
    return filters;
  }

  private deny(code: string, message: string): AuthorizationDecision {
    return {
      effect: 'deny',
      reasons: [{ code, message, plugin: 'database' }],
    };
  }
}

function toDatabaseGrant(grant: AuthorizationGrant): DatabaseActionGrant[] {
  if (!isDatabaseAuthorizationPolicy(grant.policy)) return [];
  const { type: _type, ...config } = grant.policy;
  return [config];
}

function isDatabaseAuthorizationPolicy(
  value: unknown,
): value is DatabaseAuthorizationPolicy {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Reflect.get(value, 'type') === 'database'
  );
}

function isDatabaseRecordAccess(value: unknown): value is DatabaseRecordAccess {
  if (typeof value === 'string') return value.length > 0;
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, 'key') === 'string'
  );
}

function normalizeRecordAccess(
  recordAccess: DatabaseRecordAccess,
): DatabaseRecordAccessConfig {
  return typeof recordAccess === 'string'
    ? { key: recordAccess }
    : recordAccess;
}

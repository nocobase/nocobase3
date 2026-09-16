import { UserContextRequiredError } from './record-access.js';
import type {
  AccessConstraint,
  AccessConstraintService,
  AuthorizationDecision,
  AuthorizationGrant,
  AuthorizationGrantService,
  AuthorizationRequest,
  Principal,
} from '@nocobase/authorization/core';
import { DatabaseCollectionRegistry } from './collection-registry.js';
import {
  databaseCollectionFieldsKnown,
  databaseFieldsAllowed,
  resolveDatabaseFields,
  resolveActionFields,
} from './field-access.js';
import type {
  AuthorizationCollection,
  DatabaseActionGrant,
  DatabaseAuthorizationPolicy,
  DatabaseAuthorizationParams,
  DatabaseAuthorizationConditions,
  DatabaseRecordAccess,
  DatabaseRecordAccessConfig,
  ResolveAuthorizationCollection,
} from './model.js';
import {
  allScopes,
  anyScope,
  assertDatabaseScope,
  idsScope,
  scopeAst,
  type DatabaseScope,
} from './scope.js';
import { RecordAccessPolicyRegistry } from './record-access-registry.js';

/** A decision that names this reason bypassed grants and constraints entirely. */
export const UNRESTRICTED_ACCESS = 'UNRESTRICTED_ACCESS';

/** What a Collection can be granted. db exposes no action of its own. */
const actions: readonly string[] = ['read', 'create', 'update', 'delete'];

export interface DatabaseResourceAuthorizerOptions {
  collections: DatabaseCollectionRegistry;
  recordAccess: RecordAccessPolicyRegistry;
  /** Absent when the application installed the plugin without a connection. */
  resolveCollection?: ResolveAuthorizationCollection;
}

export class DatabaseResourceAuthorizer {
  private readonly collections: DatabaseCollectionRegistry;
  private readonly recordAccess: RecordAccessPolicyRegistry;
  private readonly resolveCollection:
    ResolveAuthorizationCollection | undefined;

  constructor(options: DatabaseResourceAuthorizerOptions) {
    this.collections = options.collections;
    this.recordAccess = options.recordAccess;
    this.resolveCollection = options.resolveCollection;
  }

  /**
   * An unregistered Collection is outside the permission model, so nothing can
   * be granted on it and nothing bypasses that — a superuser skips grants, not
   * the model.
   */
  private unregistered(name: string): AuthorizationDecision | undefined {
    if (this.collections.has(name)) return undefined;
    return this.deny(
      'COLLECTION_NOT_REGISTERED',
      `Collection ${name} is not part of the permission model`,
    );
  }

  /** db owns the metadata, so an unknown Collection is whatever db does not hold. */
  private async collection(
    name: string,
    action: string,
  ): Promise<AuthorizationCollection | AuthorizationDecision> {
    if (!this.resolveCollection) {
      return this.deny(
        'DATABASE_UNAVAILABLE',
        'Database authorization was installed without a database connection',
      );
    }
    const collection = actions.includes(action)
      ? await this.resolveCollection(name)
      : undefined;
    return (
      collection ??
      this.deny(
        'UNKNOWN_DATABASE_RESOURCE_OR_ACTION',
        `Unknown database resource or action: ${name}.${action}`,
      )
    );
  }

  async authorize(
    request: AuthorizationRequest<DatabaseAuthorizationParams>,
    grantsService: AuthorizationGrantService,
    constraintsService: AccessConstraintService,
  ): Promise<AuthorizationDecision> {
    const resourceId = request.resource.id;
    const unregistered = this.unregistered(resourceId);
    if (unregistered) return unregistered;
    const resolved = await this.collection(resourceId, request.action);
    if ('effect' in resolved) return resolved;
    const resource = resolved;
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
      details: { source: grant.source },
    }));
    try {
      const constraints =
        request.action === 'create'
          ? []
          : await constraintsService.resolve({
              principal: request.principal,
              subjects: request.subjects,
              resource: { type: 'database.collection', id: resourceId },
              action: request.action,
            });
      const scope =
        request.action === 'create'
          ? true
          : await this.resolveEffectiveScope(
              request.principal,
              resource,
              request.action,
              configs,
              constraints,
            );
      const explanation = [
        ...reasons,
        ...constraints.map((constraint) => ({
          code:
            constraint.effect === 'expand'
              ? 'SCOPE_EXPANDED'
              : 'SCOPE_RESTRICTED',
          message: `${constraint.source.plugin}:${constraint.source.id}`,
          plugin: 'database',
          details: { source: constraint.source, scope: constraint.value },
        })),
      ];
      if (scope === false) {
        const denied = this.deny(
          'NO_RECORD_ACCESS',
          'No Record Access allows this action',
        );
        return { ...denied, reasons: [...denied.reasons, ...explanation] };
      }
      const conditions: DatabaseAuthorizationConditions = {
        type: 'database',
        collection: resourceId,
        action: request.action,
        scope: scope === true ? true : scopeAst(resourceId, scope),
        fields: resolveActionFields(request.action, fields, resource),
        fieldAccess: fields,
        allFields:
          request.action === 'delete' ||
          ((request.action === 'read' ||
            fields.input === '*' ||
            resolveActionFields(
              request.action,
              { input: '*', output: '*' },
              resource,
            ).every((field) => fields.input.includes(field))) &&
            (fields.output === '*' ||
              resource.fields.every((field) => fields.output.includes(field)))),
      };
      return {
        effect: 'conditional',
        conditions,
        reasons: explanation,
      };
    } catch (error) {
      if (error instanceof UserContextRequiredError) {
        const decision = this.deny('USER_CONTEXT_REQUIRED', error.message);
        return { ...decision, reasons: [...decision.reasons, ...reasons] };
      }
      return this.deny(
        'DATABASE_AUTHORIZATION_FAILED',
        error instanceof Error
          ? error.message
          : 'Database authorization failed',
      );
    }
  }

  /**
   * An identity with unrestricted access skips grants, Sharing Rules and
   * Restriction Rules. Callers still bind a Policy from the returned
   * conditions, so the decision stays conditional with an unrestricted scope
   * and every registered field allowed. The two validity checks remain: they
   * report a malformed request, not a permission.
   */
  async authorizeUnrestricted(
    request: AuthorizationRequest<DatabaseAuthorizationParams>,
  ): Promise<AuthorizationDecision> {
    const resourceId = request.resource.id;
    const unregistered = this.unregistered(resourceId);
    if (unregistered) return unregistered;
    const resolved = await this.collection(resourceId, request.action);
    if ('effect' in resolved) return resolved;
    const resource = resolved;
    if (!databaseCollectionFieldsKnown(resource, request.params?.fields)) {
      return this.deny(
        'UNKNOWN_DATABASE_FIELD',
        `One or more requested fields are not registered for ${resourceId}`,
      );
    }
    const conditions: DatabaseAuthorizationConditions = {
      type: 'database',
      collection: resourceId,
      action: request.action,
      scope: true,
      fields: resource.fields,
      fieldAccess: { input: '*', output: '*' },
      allFields: true,
    };
    return {
      effect: 'conditional',
      conditions,
      reasons: [
        {
          code: UNRESTRICTED_ACCESS,
          message: `Unrestricted access allows ${resourceId}.${request.action}`,
          plugin: 'database',
        },
      ],
    };
  }

  private async resolveEffectiveScope(
    principal: Principal,
    resource: AuthorizationCollection,
    action: string,
    configs: readonly DatabaseActionGrant[],
    constraints: readonly AccessConstraint[],
  ): Promise<DatabaseScope> {
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
    return allScopes([anyScope(positive), ...restrictions]);
  }

  private async compileConstraints(
    constraints: readonly AccessConstraint[],
    principal: Principal,
    resource: AuthorizationCollection,
    action: string,
  ): Promise<DatabaseScope[]> {
    const scopes: DatabaseScope[] = [];
    for (const constraint of constraints) {
      const value = constraint.value;
      if (value.type === 'all') {
        scopes.push(true);
        continue;
      }
      if (value.type === 'ids') {
        const ids = 'ids' in value ? value.ids : undefined;
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
          throw new Error('Invalid IDs access scope');
        }
        scopes.push(idsScope(resource.primaryKey, ids as string[]));
        continue;
      }
      if (value.type !== 'database') {
        throw new Error(`Unsupported database access scope: ${value.type}`);
      }
      const recordAccess = value.recordAccess;
      if (!isDatabaseRecordAccess(recordAccess)) {
        throw new Error('Invalid database Record Access scope');
      }
      scopes.push(
        ...(await this.compileScopes(principal, resource, action, [
          recordAccess,
        ])),
      );
    }
    return scopes;
  }

  private async compileScopes(
    principal: Principal,
    resource: AuthorizationCollection,
    action: string,
    scopes: readonly DatabaseRecordAccess[],
  ): Promise<DatabaseScope[]> {
    const resolved: DatabaseScope[] = [];
    for (const scope of scopes) {
      const config = normalizeRecordAccess(scope);
      const policy = this.recordAccess.get(config.key);
      if (!policy) {
        throw new Error(`Unknown Record Access policy: ${config.key}`);
      }
      const value: unknown = await policy.resolve({
        principal,
        collection: resource,
        action,
        params: config.params,
      });
      assertDatabaseScope(value, resource.fields);
      resolved.push(value);
    }
    return resolved;
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

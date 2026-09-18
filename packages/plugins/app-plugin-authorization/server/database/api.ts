import {
  databaseGrant,
  databaseScope,
  type DatabaseOperation,
} from './builders.js';
import { DatabaseCollectionRegistry } from './collection-registry.js';
import type {
  ResourceAuthorizationCheck,
  AuthorizationDecision,
  AuthorizationScope,
} from '@nocobase/authorization/core';
import type { Authorization } from '@nocobase/authorization/core';
import type { PermissionGrant } from '@nocobase/authorization/permissions';
import type { RepositoryPolicy } from '@nocobase/db';
import {
  createRepositoryAuthorization,
  type RepositoryAuthorization,
  type RepositoryAuthorizationExposure,
} from '../repositories.js';
import { UNRESTRICTED_ACCESS } from './authorizer.js';
import type {
  DatabaseAccessScope,
  DatabaseAuthorizationParams,
  DatabaseAuthorizationConditions,
  DatabaseGrantDefinition,
  DatabaseRecordAccess,
} from './model.js';

export interface DatabaseApi {
  readonly collections: DatabaseCollectionRegistry;
  grant(resource: string, definition: DatabaseGrantDefinition): PermissionGrant;
  scope(recordAccess: DatabaseRecordAccess): DatabaseAccessScope;
  policyFor(
    collection: string,
    scope: AuthorizationScope,
    operation?: { resource: string; action: string },
  ): Promise<RepositoryPolicy>;
  repositories(
    exposures: readonly RepositoryAuthorizationExposure[],
  ): RepositoryAuthorization;
}

export interface DatabaseAuthorizationApi {
  db: DatabaseApi;
}

export class DatabaseAuthorizationService implements DatabaseApi {
  readonly collections: DatabaseCollectionRegistry =
    new DatabaseCollectionRegistry();
  private host: Authorization | undefined;

  /**
   * The Authorization this api was installed into. A plugin's `setup` is not
   * handed the instance, so the host binds it once the instance exists.
   */
  installInto(authz: Authorization): void {
    this.host = authz;
  }

  /**
   * Narrows Repository API policies for explicitly registered collections.
   */
  repositories(
    exposures: readonly RepositoryAuthorizationExposure[],
  ): RepositoryAuthorization {
    if (!this.host) {
      throw new Error(
        'Database authorization was not installed into an Authorization',
      );
    }
    return createRepositoryAuthorization(this.host, this, exposures);
  }

  grant(
    resource: string,
    definition: DatabaseGrantDefinition,
  ): PermissionGrant {
    return databaseGrant(resource, definition);
  }

  scope(recordAccess: DatabaseRecordAccess): DatabaseAccessScope {
    return databaseScope(recordAccess);
  }

  /**
   * Folds this request's four decisions into one Repository Policy.
   *
   * The calls share the scope's grant and constraint caches, so authorizing
   * four actions costs one resolution each. Every node is complete, including
   * an explicit relation allowlist; binding and narrowing have identical defaults.
   */
  async policyFor(
    collection: string,
    scope: AuthorizationScope,
    operation?: { resource: string; action: string },
  ): Promise<RepositoryPolicy> {
    const resource = { type: 'database.collection', id: collection };
    const decide = async <A extends DatabaseOperation>(
      action: A,
    ): Promise<RepositoryPolicy[A]> =>
      foldDecision(
        action,
        await scope.authorize<DatabaseAuthorizationParams>({
          resource,
          action,
          params: operation ? { operation } : {},
        }),
      );
    const [read, create, update, remove] = await Promise.all([
      decide('read'),
      decide('create'),
      decide('update'),
      decide('delete'),
    ]);
    return { read, create, update, delete: remove };
  }
}

/** Translate resolved checks only; this never runs authorization again. */
export function composeDatabasePolicies(
  checks: readonly ResourceAuthorizationCheck[],
): Readonly<Record<string, RepositoryPolicy>> {
  type MutablePolicy = {
    -readonly [K in keyof RepositoryPolicy]: RepositoryPolicy[K];
  };
  const policies: Record<string, MutablePolicy> = Object.create(null) as Record<
    string,
    MutablePolicy
  >;
  for (const check of checks) {
    if (check.resource.type !== 'database.collection') continue;
    const policy = (policies[check.resource.id] ??= {
      read: false,
      create: false,
      update: false,
      delete: false,
    });
    switch (check.action) {
      case 'read':
        policy.read = foldDecision('read', check.decision);
        break;
      case 'create':
        policy.create = foldDecision('create', check.decision);
        break;
      case 'update':
        policy.update = foldDecision('update', check.decision);
        break;
      case 'delete':
        policy.delete = foldDecision('delete', check.decision);
        break;
    }
  }
  return policies;
}

declare module '@nocobase/authorization/core' {
  interface ResourceAuthorizationConditions {
    /** Policies for the tables used by this operation; other operations remain denied. */
    database?: Readonly<Record<string, RepositoryPolicy>>;
  }
}

function foldDecision<A extends DatabaseOperation>(
  action: A,
  decision: AuthorizationDecision,
): RepositoryPolicy[A] {
  if (decision.effect === 'deny') return false;
  if (decision.effect === 'permit') return true;
  const conditions = decision.conditions;
  if (!isDatabaseConditions(conditions) || conditions.action !== action) {
    return false;
  }
  // An unrestricted identity bypassed every grant, so the allowlist the
  // handler reported is the whole Collection and says nothing a node should.
  if (decision.reasons.some((reason) => reason.code === UNRESTRICTED_ACCESS)) {
    return true;
  }
  // The authorizer resolves the action-specific relation tree. Keep the only
  // structural conversion at this DB adapter boundary.
  return action === 'delete'
    ? { scope: conditions.scope }
    : {
        scope: action === 'create' ? true : conditions.scope,
        fields: conditions.fields,
        relations: conditions.relations ?? false,
      };
}

function isDatabaseConditions(
  value: unknown,
): value is DatabaseAuthorizationConditions {
  return (
    value !== null &&
    typeof value === 'object' &&
    Reflect.get(value, 'type') === 'database'
  );
}

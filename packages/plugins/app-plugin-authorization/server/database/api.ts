import type {
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
  DatabaseAuthorizationConditions,
  DatabaseGrantDefinition,
  DatabaseRecordAccess,
} from './model.js';
import { RecordAccessPolicyRegistry } from './record-access-registry.js';

export interface DatabaseApi {
  readonly recordAccess: RecordAccessPolicyRegistry;
  grant(resource: string, definition: DatabaseGrantDefinition): PermissionGrant;
  scope(recordAccess: DatabaseRecordAccess): DatabaseAccessScope;
  policyFor(
    collection: string,
    scope: AuthorizationScope,
  ): Promise<RepositoryPolicy>;
  repositories(
    exposures: readonly RepositoryAuthorizationExposure[],
  ): RepositoryAuthorization;
}

export interface DatabaseAuthorizationApi {
  db: DatabaseApi;
}

export class DatabaseAuthorizationService implements DatabaseApi {
  readonly recordAccess: RecordAccessPolicyRegistry;
  private host: Authorization | undefined;

  constructor(recordAccess: RecordAccessPolicyRegistry) {
    this.recordAccess = recordAccess;
  }

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
    return {
      resource: { type: 'database.collection', id: resource },
      actions: Object.entries(definition).map(([action, config]) => ({
        action,
        policy: { type: 'database', ...config },
      })),
    };
  }

  scope(recordAccess: DatabaseRecordAccess): DatabaseAccessScope {
    return {
      type: 'database',
      recordAccess,
    };
  }

  /**
   * Folds this request's four decisions into one Repository Policy.
   *
   * The calls share the scope's grant and constraint caches, so authorizing
   * four actions costs one resolution each. `relations` is left out
   * throughout: authorization has no relation model, and an absent one
   * normalizes to none, which is the conservative reading.
   */
  async policyFor(
    collection: string,
    scope: AuthorizationScope,
  ): Promise<RepositoryPolicy> {
    const resource = { type: 'database.collection', id: collection };
    const decide = async (
      action: string,
    ): Promise<true | false | DatabasePolicyNode> =>
      foldDecision(action, await scope.authorize({ resource, action }));
    const [read, create, update, remove] = await Promise.all([
      decide('read'),
      decide('create'),
      decide('update'),
      decide('delete'),
    ]);
    return {
      read,
      // A create selects no rows, so its node carries no scope of its own.
      create: typeof create === 'boolean' ? create : { ...create, scope: true },
      update,
      // A delete node accepts a scope and nothing else.
      delete: typeof remove === 'boolean' ? remove : { scope: remove.scope },
    };
  }
}

interface DatabasePolicyNode {
  readonly scope: true | DatabaseAuthorizationConditions['scope'];
  readonly fields: readonly string[];
}

function foldDecision(
  action: string,
  decision: AuthorizationDecision,
): true | false | DatabasePolicyNode {
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
  return { scope: conditions.scope, fields: conditions.fields };
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

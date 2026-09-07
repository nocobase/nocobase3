import type {
  AppAuthorization,
  AuthorizationScope,
} from '@nocobase/app-plugin-authorization';
import type {
  AuditEventDto,
  ResourceRef,
  TrustedAuditScope,
} from './contracts.js';
import type { AuditQueryAuthorization } from './internal-contracts.js';
import { snapshotAuditScope } from './scope.js';
import { normalizeResourceRef } from './event-normalizer.js';

export class AuditAccessDenied extends Error {
  constructor() {
    super('Audit access denied.');
  }
}

const registered: WeakSet<AppAuthorization> = new WeakSet();
/** Uses the application's existing grant engine and permission sets. */
export function registerAuditPermissions(
  authorization: AppAuthorization,
): void {
  if (registered.has(authorization)) return;
  for (const resourceType of ['audit.events', 'audit.settings']) {
    authorization.resources.add({
      resourceType,
      async authorize(request, context) {
        const supported =
          resourceType === 'audit.events'
            ? ['read', 'readAll', 'readDeleted', 'readMetadata']
            : ['read', 'manage'];
        if (!supported.includes(request.action))
          return { effect: 'deny', reasons: [] };
        const grants = await context.grants.resolve(request);
        return {
          effect: grants.some((grant) => grant.policy === undefined)
            ? 'permit'
            : 'deny',
          reasons: [],
        };
      },
    });
  }
  registered.add(authorization);
}

export function auditPermissionId(
  scope: Pick<TrustedAuditScope, 'appId' | 'securityScope'>,
  store: string,
): string {
  return JSON.stringify([scope.appId, scope.securityScope ?? null, store]);
}

export interface AuditResourceAdapter {
  readonly dataSource: string;
  readonly resource: string;
  /** Applies the existing resource authorization filter to the real target query. */
  canRead(
    authorization: AuthorizationScope,
    target: ResourceRef,
  ): Promise<'allowed' | 'denied' | 'deleted'>;
}
export interface AuditAuthorizationOptions {
  readonly boundary: Pick<TrustedAuditScope, 'appId' | 'securityScope'>;
  readonly stores: readonly string[];
  /** A live source returns stable entry identities until registration changes. */
  readonly adapters:
    readonly AuditResourceAdapter[] | (() => readonly AuditResourceAdapter[]);
}
export interface AuditAuthorizationEvidence {
  readonly target?: ResourceRef;
  readonly metadata: boolean;
}

export class AuditAuthorization {
  private readonly issued = new WeakMap<
    AuditQueryAuthorization,
    AuditAuthorizationEvidence
  >();
  private readonly boundary: Pick<TrustedAuditScope, 'appId' | 'securityScope'>;
  private readonly stores: readonly string[];
  private readonly adapters: () => readonly AuditResourceAdapter[];
  constructor(options: AuditAuthorizationOptions) {
    this.boundary = Object.freeze({ ...options.boundary });
    this.stores = Object.freeze([...options.stores]);
    const adapters = options.adapters;
    if (typeof adapters === 'function') this.adapters = adapters;
    else {
      const fixed = Object.freeze([...adapters]);
      this.adapters = () => fixed;
    }
  }
  async require(
    authz: AuthorizationScope,
    store: string,
    resource: 'audit.events' | 'audit.settings',
    action: string,
  ): Promise<void> {
    if (
      !this.stores.includes(store) ||
      !(await authz.can({
        resource: {
          type: resource,
          id: auditPermissionId(this.boundary, store),
        },
        action,
      }))
    )
      throw new AuditAccessDenied();
  }
  async issue(
    authz: AuthorizationScope,
    store: string,
    target?: ResourceRef,
  ): Promise<AuditQueryAuthorization> {
    await this.require(authz, store, 'audit.events', 'read');
    const scope = snapshotAuditScope({
      ...this.boundary,
      actor: {
        type: authz.identity.principal.type,
        id: authz.identity.principal.id,
      },
    });
    const can = (action: string): Promise<boolean> =>
      authz.can({
        resource: { type: 'audit.events', id: auditPermissionId(scope, store) },
        action,
      });
    const [all, deleted, metadata] = await Promise.all([
      can('readAll'),
      can('readDeleted'),
      can('readMetadata'),
    ]);
    const fixedTarget = target
      ? Object.freeze({
          ...target,
          ...(typeof target.key === 'object'
            ? { key: Object.freeze({ ...target.key }) }
            : {}),
        })
      : undefined;
    if (fixedTarget) normalizeResourceRef(fixedTarget, scope);
    if (
      !all &&
      (!fixedTarget ||
        fixedTarget.dataSource === undefined ||
        fixedTarget.key === undefined)
    )
      throw new AuditAccessDenied();
    const check = async (
      candidate: ResourceRef | undefined,
    ): Promise<boolean> => {
      if (all) return true;
      if (!candidate || !fixedTarget) return false;
      const left = normalizeResourceRef(candidate, scope);
      const right = normalizeResourceRef(fixedTarget, scope);
      if (
        left.resource !== right.resource ||
        left.dataSource !== right.dataSource ||
        left.keyEncoding !== right.keyEncoding
      )
        return false;
      const matches = this.adapters().filter(
        (entry) =>
          entry.dataSource === candidate.dataSource &&
          entry.resource === candidate.resource,
      );
      if (matches.length !== 1) return false;
      const adapter = matches[0];
      const result = await adapter.canRead(authz, candidate);
      const current = this.adapters().filter(
        (entry) =>
          entry.dataSource === candidate.dataSource &&
          entry.resource === candidate.resource,
      );
      if (current.length !== 1 || current[0] !== adapter) return false;
      return result === 'allowed' || (result === 'deleted' && deleted);
    };
    if (!all && !(await check(fixedTarget))) throw new AuditAccessDenied();
    const proof: AuditQueryAuthorization = Object.freeze({
      scope,
      stores: Object.freeze([store]),
      readDeleted: deleted,
      canRead: (event: AuditEventDto) => check(event.target),
    });
    this.issued.set(proof, Object.freeze({ target: fixedTarget, metadata }));
    return proof;
  }
  verify(proof: AuditQueryAuthorization): AuditAuthorizationEvidence {
    const evidence = this.issued.get(proof);
    if (!evidence) throw new AuditAccessDenied();
    return evidence;
  }
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { types } from 'node:util';
import type { TrustedAuditScope } from './contracts.js';
import type { AuditScopeCarrier } from './internal-contracts.js';
import { normalizeEvent } from './event-normalizer.js';
import { AuditError } from './errors.js';

/** Copies only the frozen scope contract through the existing safe normalizer. */
export function snapshotAuditScope(
  scope: TrustedAuditScope,
): TrustedAuditScope {
  const seed = normalizeEvent(
    { action: 'audit.scope', outcome: 'unknown' },
    {
      scope,
      kind: 'business',
      producer: 'audit.scope',
      store: 'scope',
      id: 'scope',
      occurredAt: '2000-01-01T00:00:00.000Z',
      recordedAt: '2000-01-01T00:00:00.000Z',
      policyVersion: 0,
    },
  ).event;
  return Object.freeze({
    appId: seed.appId,
    securityScope: seed.securityScope,
    actor: Object.freeze(seed.actor),
    initiator:
      seed.initiator === undefined ? undefined : Object.freeze(seed.initiator),
    roleIds:
      seed.roleIds === undefined ? undefined : Object.freeze(seed.roleIds),
    operationId: seed.operationId,
    requestId: seed.requestId,
    runId: seed.runId,
    correlationId: seed.correlationId,
  });
}

interface ScopeFrame {
  readonly scope: TrustedAuditScope;
  readonly parent?: ScopeFrame;
  active: boolean;
}

/** Node-only identity carrier. It never selects or stores a database connection. */
export class NodeAuditScopeCarrier implements AuditScopeCarrier {
  readonly #storage = new AsyncLocalStorage<ScopeFrame>();
  readonly #appId: string;
  #disposed = false;

  constructor(appId: string) {
    this.#appId = snapshotAuditScope({
      appId,
      actor: { type: 'unknown' },
    }).appId;
  }

  current(): TrustedAuditScope | undefined {
    const frame = this.#storage.getStore();
    if (this.#disposed || !frame) return undefined;
    for (
      let ancestor: ScopeFrame | undefined = frame;
      ancestor;
      ancestor = ancestor.parent
    ) {
      if (!ancestor.active) return undefined;
    }
    return frame.scope;
  }

  run<T>(scope: TrustedAuditScope, callback: () => T): T {
    if (this.#disposed) throw new AuditError('AUDIT_NOT_READY');
    const snapshot = snapshotAuditScope(scope);
    if (snapshot.appId !== this.#appId)
      throw new AuditError('AUDIT_INVALID_EVENT');
    const frame: ScopeFrame = {
      scope: snapshot,
      active: true,
      parent: this.current() ? this.#storage.getStore() : undefined,
    };
    return this.#storage.run(frame, () => {
      try {
        const result = callback();
        if (types.isPromise(result)) {
          return result.finally(() => {
            frame.active = false;
          }) as T;
        }
        frame.active = false;
        return result;
      } catch (error) {
        frame.active = false;
        throw error;
      }
    });
  }

  dispose(): void {
    this.#disposed = true;
    this.#storage.disable();
  }
}

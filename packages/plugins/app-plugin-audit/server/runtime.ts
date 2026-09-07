import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import type {
  AuditRecorder,
  Principal,
  TrustedAuditScope,
} from './contracts.js';
import type { AuditScopeCarrier } from './internal-contracts.js';
import { AuditError } from './errors.js';
import { snapshotAuditScope } from './scope.js';

export interface AuditRuntimeOptions {
  readonly appId: string;
  readonly securityScope?: string;
  readonly carrier: AuditScopeCarrier;
  /** Trusted composition binds the existing Recorder and fixed producer/store. */
  readonly bind: (scope: TrustedAuditScope) => AuditRecorder;
  /** Safe diagnostic only; no event, identity, request or original error is supplied. */
  readonly diagnostic: (code: 'AUDIT_SCOPE_MISSING') => void;
}

export interface AuditRuntimeIdentity {
  readonly actor: Principal;
  readonly roleIds?: readonly string[];
}

/** Tracking hints only. No actor, initiator, roles, session or authorization proof. */
export interface AuditBackgroundTrace {
  readonly appId: string;
  readonly securityScope?: string;
  readonly operationId?: string;
  readonly requestId?: string;
  readonly runId?: string;
  readonly correlationId?: string;
}

export type AuditBackgroundVerifier = (
  trace: AuditBackgroundTrace,
) => Promise<TrustedAuditScope | undefined>;

/** Give this object only to trusted authentication/runtime adapters, never ordinary handlers. */
export class TrustedAuditRuntime {
  readonly #carrier: AuditScopeCarrier;
  readonly #base: TrustedAuditScope;
  readonly #diagnostic: AuditRuntimeOptions['diagnostic'];
  readonly recorder: AuditRecorder;
  #disposed = false;

  constructor(options: AuditRuntimeOptions) {
    this.#carrier = options.carrier;
    this.#base = snapshotAuditScope({
      appId: options.appId,
      securityScope: options.securityScope,
      actor: { type: 'unknown' },
    });
    this.#diagnostic = options.diagnostic;
    const bind = options.bind;
    this.recorder = Object.freeze({
      record: async (event, recordOptions) =>
        bind(this.current()).record(event, recordOptions),
    } satisfies AuditRecorder);
  }

  current(): TrustedAuditScope {
    if (this.#disposed) throw new AuditError('AUDIT_NOT_READY');
    const scope = this.#carrier.current();
    if (!scope) {
      this.#diagnostic('AUDIT_SCOPE_MISSING');
      return this.#base;
    }
    this.#assertBoundary(scope);
    return scope;
  }

  /** Called at request entry; client headers and bodies are deliberately not inputs. */
  runRequest<T>(callback: () => T): T {
    return this.#carrier.run(
      {
        ...this.#base,
        actor: { type: 'anonymous' },
        requestId: randomUUID(),
        operationId: randomUUID(),
        correlationId: randomUUID(),
      },
      callback,
    );
  }

  /** Invoke only after server authentication succeeds; snapshot precedes logout side effects. */
  runAuthenticated<T>(identity: AuditRuntimeIdentity, callback: () => T): T {
    const parent = this.current();
    return this.#carrier.run(
      {
        ...parent,
        actor: identity.actor,
        roleIds: identity.roleIds,
        initiator: parent.initiator ?? identity.actor,
      },
      callback,
    );
  }

  /** Use after the authenticated logout observation has been recorded. */
  runAnonymous<T>(callback: () => T): T {
    const parent = this.current();
    return this.#carrier.run(
      {
        ...parent,
        actor: { type: 'anonymous' },
        roleIds: undefined,
      },
      callback,
    );
  }

  runChild<T>(identity: AuditRuntimeIdentity, callback: () => T): T {
    const parent = this.current();
    return this.#carrier.run(
      {
        ...parent,
        actor: identity.actor,
        roleIds: identity.roleIds,
        initiator:
          parent.initiator ??
          (parent.actor.type === 'unknown' ? undefined : parent.actor),
        runId: randomUUID(),
      },
      callback,
    );
  }

  exportBackgroundTrace(): AuditBackgroundTrace {
    const scope = this.current();
    return Object.freeze({
      appId: scope.appId,
      securityScope: scope.securityScope,
      operationId: scope.operationId,
      requestId: scope.requestId,
      runId: scope.runId,
      correlationId: scope.correlationId,
    });
  }

  /**
   * The verifier must check transport provenance and load the original identity and
   * IDs from trusted job state. Hints are never merged into its authoritative result.
   * Authorization remains the worker's separate responsibility.
   */
  async runBackground<T>(
    trace: AuditBackgroundTrace,
    verify: AuditBackgroundVerifier,
    callback: () => Promise<T>,
  ): Promise<T> {
    if (this.#disposed) throw new AuditError('AUDIT_NOT_READY');
    // The normalizer rejects extra keys, accessors and exotic objects before verification.
    if (trace === null || typeof trace !== 'object' || types.isProxy(trace))
      throw new AuditError('AUDIT_INVALID_EVENT');
    const allowed = [
      'appId',
      'securityScope',
      'operationId',
      'requestId',
      'runId',
      'correlationId',
    ];
    if (
      Reflect.ownKeys(trace).some(
        (key) => typeof key !== 'string' || !allowed.includes(key),
      )
    )
      throw new AuditError('AUDIT_INVALID_EVENT');
    const checked = snapshotAuditScope(trace as TrustedAuditScope);
    this.#assertBoundary(checked);
    if (
      checked.actor.type !== 'unknown' ||
      checked.initiator ||
      checked.roleIds
    )
      throw new AuditError('AUDIT_INVALID_EVENT');
    const hints: AuditBackgroundTrace = Object.freeze({
      appId: checked.appId,
      securityScope: checked.securityScope,
      operationId: checked.operationId,
      requestId: checked.requestId,
      runId: checked.runId,
      correlationId: checked.correlationId,
    });
    const scope = await verify(hints);
    if (!scope) throw new AuditError('AUDIT_INVALID_EVENT');
    const verified = snapshotAuditScope(scope);
    this.#assertBoundary(verified);
    return this.#carrier.run(verified, callback);
  }

  dispose(): void {
    this.#disposed = true;
    this.#carrier.dispose();
  }

  #assertBoundary(scope: TrustedAuditScope): void {
    if (
      scope.appId !== this.#base.appId ||
      scope.securityScope !== this.#base.securityScope
    )
      throw new AuditError('AUDIT_INVALID_EVENT');
  }
}

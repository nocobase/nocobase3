import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { findTargetHandler } from 'hono/utils/handler';
import { TrieRouter } from 'hono/router/trie-router';
import type { ApplicationHttpObserver } from '@nocobase/app-server/application';
import type {
  AuditHttpDeclaration,
  AuditHttpResult,
  AuditOutcome,
  AuditSettings,
  TrustedAuditScope,
  AuditEventDto,
  AuditDeclaredRoute,
} from './contracts.js';
import { AuditError } from './errors.js';
import { normalizeEvent } from './event-normalizer.js';
import { snapshotAuditScope } from './scope.js';
import type { TrustedAuditRuntime } from './runtime.js';
import type { PersistentAuditSettingsService } from './settings-service.js';
import type { PortableAuditStore } from './store.js';
import type { LocalAuditHealthService } from './health-service.js';

export interface AuditHttpCollectorOptions {
  readonly runtime: TrustedAuditRuntime;
  readonly settings: PersistentAuditSettingsService;
  readonly stores: readonly PortableAuditStore[];
  readonly health: LocalAuditHealthService;
}
interface RequestCapture {
  scope: TrustedAuditScope;
  readonly started: number;
  readonly occurredAt: string;
  readonly id: string;
  policy?: AuditSettings;
  declaration?: AuditHttpDeclaration;
  routePattern?: string;
  result?: AuditHttpResult;
  completion?: Promise<void>;
  release(): void;
}
function safeCode(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/.test(value)
  );
}
function outcome(
  status: number,
  error: Error | undefined,
  marker?: AuditHttpResult,
): AuditOutcome {
  if (status === 401 || status === 403) return 'denied';
  if (status >= 400 || error) return 'failed';
  if (marker) return marker.outcome;
  if (status === 202) return 'accepted';
  return status >= 200 && status < 300 ? 'success' : 'unknown';
}
function dataObject(value: unknown, keys: readonly string[]): void {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    ![Object.prototype, null].includes(
      Object.getPrototypeOf(value) as object | null,
    ) ||
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' ||
        !keys.includes(key) ||
        !Object.hasOwn(
          Object.getOwnPropertyDescriptor(value, key) ?? {},
          'value',
        ),
    )
  )
    throw new AuditError('AUDIT_INVALID_EVENT');
}

/** Conservative overlap check, not a replacement for Hono routing. */
function pathsMayOverlap(left: string, right: string): boolean {
  // A literal route has one possible path. Let Hono evaluate constraints rather
  // than trying to parse regular expressions or prove two dynamic paths disjoint.
  const literal = /^\/[A-Za-z0-9_./-]*$/;
  const fixed = literal.test(left)
    ? left
    : literal.test(right)
      ? right
      : undefined;
  if (fixed !== undefined) {
    try {
      const matcher = new TrieRouter<boolean>();
      matcher.add('ALL', fixed === left ? right : left, true);
      return matcher.match('ALL', fixed)[0].length > 0;
    } catch {
      // An unrecognized path must never turn a potential conflict into a pass.
      return true;
    }
  }
  const a = left.split('/');
  const b = right.split('/');
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index];
    const y = b[index];
    if (x === '*' || y === '*') return true;
    if (x === undefined || y === undefined)
      return (x ?? y)?.endsWith('?') ?? false;
    // Regex constraints can include slashes; their suffix cannot safely prove disjointness.
    if (x.includes('{') || y.includes('{')) return true;
    if (x.startsWith(':') || y.startsWith(':')) continue;
    if (x !== y) return false;
  }
  return true;
}

/** App-owned collector. Ordinary routes receive only http and markHttpResult. */
export class AuditHttpCollector implements ApplicationHttpObserver {
  private readonly declarationIdentities: WeakMap<
    object,
    {
      readonly identity: AuditHttpDeclaration;
      readonly captured: AuditHttpDeclaration;
    }
  > = new WeakMap();
  private readonly declarations: WeakMap<
    object,
    Pick<AuditDeclaredRoute, 'action' | 'titleKey'>
  > = new WeakMap();

  /** Reads only this collector's declarations in the host's fully assembled Hono table. */
  describeRoutes(
    routes: readonly {
      readonly method: string;
      readonly path: string;
      readonly handler: MiddlewareHandler;
    }[],
  ): readonly AuditDeclaredRoute[] {
    const result = new Map<string, AuditDeclaredRoute>();
    for (const route of routes) {
      const declaration = this.declarations.get(
        findTargetHandler(route.handler),
      );
      if (!declaration) continue;
      const value = Object.freeze({
        method: route.method,
        path: route.path,
        ...declaration,
      });
      result.set(JSON.stringify(value), value);
    }
    return Object.freeze([...result.values()]);
  }

  /** Validate mounted declarations after composition, before the host accepts traffic. */
  validateRoutes(
    routes: readonly {
      readonly method: string;
      readonly path: string;
      readonly handler: MiddlewareHandler;
    }[],
  ): void {
    const declared = routes.flatMap((route) => {
      const declaration = this.declarationIdentities.get(
        findTargetHandler(route.handler),
      );
      return declaration ? [{ ...route, ...declaration }] : [];
    });
    for (let index = 0; index < declared.length; index++) {
      const left = declared[index];
      for (const right of declared.slice(index + 1)) {
        if (
          left.identity === right.identity &&
          left.captured.action === right.captured.action &&
          left.captured.titleKey === right.captured.titleKey &&
          left.captured.target === right.captured.target &&
          left.captured.details === right.captured.details
        )
          continue;
        if (
          left.method !== right.method &&
          left.method !== 'ALL' &&
          right.method !== 'ALL'
        )
          continue;
        if (pathsMayOverlap(left.path, right.path))
          throw new AuditError('AUDIT_INVALID_EVENT');
      }
    }
  }
  private readonly requests: WeakMap<Context, RequestCapture> = new WeakMap();
  private readonly pending: Set<Promise<void>> = new Set();
  private readonly active: Set<Promise<void>> = new Set();
  private readonly stores: ReadonlyMap<string, PortableAuditStore>;
  private disposed = false;
  private finalized = 0;
  constructor(private readonly options: AuditHttpCollectorOptions) {
    this.stores = new Map(
      options.stores.map((store) => [store.binding.store, store]),
    );
    if (!this.stores.size || this.stores.size !== options.stores.length)
      throw new AuditError('AUDIT_NOT_READY');
  }

  http(declaration: AuditHttpDeclaration): MiddlewareHandler {
    dataObject(declaration, ['action', 'titleKey', 'target', 'details']);
    if (
      !safeCode(declaration.action) ||
      (declaration.titleKey !== undefined && !safeCode(declaration.titleKey)) ||
      (declaration.target !== undefined &&
        typeof declaration.target !== 'function') ||
      (declaration.details !== undefined &&
        typeof declaration.details !== 'function')
    )
      throw new AuditError('AUDIT_INVALID_EVENT');
    const captured = Object.freeze({ ...declaration });
    const handler: MiddlewareHandler = async (context, next): Promise<void> => {
      const request = this.requests.get(context);
      if (request && !request.declaration) {
        request.declaration = captured;
        // Hono exposes the matched declaration, not a URL containing user data.
        request.routePattern =
          context.req.matchedRoutes[context.req.routeIndex]?.path ?? '*';
        this.captureScope(context);
      }
      await next();
    };
    this.declarationIdentities.set(handler, {
      identity: declaration,
      captured,
    });
    this.declarations.set(
      handler,
      Object.freeze({
        action: captured.action,
        ...(captured.titleKey ? { titleKey: captured.titleKey } : {}),
      }),
    );
    return handler;
  }

  markHttpResult(context: Context, result: AuditHttpResult): void {
    dataObject(result, ['outcome', 'reasonCode']);
    if (
      !['success', 'failed', 'denied', 'accepted', 'unknown'].includes(
        result.outcome,
      ) ||
      (result.reasonCode !== undefined && !safeCode(result.reasonCode))
    )
      throw new AuditError('AUDIT_INVALID_EVENT');
    const request = this.requests.get(context);
    if (request && !request.completion) {
      request.result = Object.freeze({ ...result });
    }
  }

  /** Only trusted authentication adapters call this inside runAuthenticated/runAnonymous. */
  captureScope(context: Context): void {
    const request = this.requests.get(context);
    if (!request || request.completion) return;
    const scope = snapshotAuditScope(this.options.runtime.current());
    if (
      scope.appId !== request.scope.appId ||
      scope.securityScope !== request.scope.securityScope ||
      scope.requestId !== request.scope.requestId ||
      scope.operationId !== request.scope.operationId
    )
      throw new AuditError('AUDIT_INVALID_EVENT');
    request.scope = scope;
  }

  async run(context: Context, next: Next): Promise<void> {
    if (this.disposed) {
      await next();
      return;
    }
    await this.options.runtime.runRequest(async () => {
      let release!: () => void;
      const active = new Promise<void>((resolve) => {
        release = resolve;
      });
      this.active.add(active);
      const request: RequestCapture = {
        scope: snapshotAuditScope(this.options.runtime.current()),
        started: performance.now(),
        occurredAt: new Date().toISOString(),
        id: randomUUID(),
        release: () => {
          this.active.delete(active);
          release();
        },
      };
      this.requests.set(context, request);
      try {
        request.policy = await this.options.settings.snapshot(request.scope);
      } catch {
        this.failure();
      }
      await next();
    });
  }

  finalize(context: Context): Promise<void> {
    const request = this.requests.get(context);
    if (!request) return Promise.resolve();
    if (!request.completion) {
      const attempt = Promise.resolve().then(() =>
        this.persist(context, request),
      );
      this.pending.add(attempt);
      // This promise is the same controlled attempt returned to the host; no retry or timeout race.
      request.completion = attempt.finally(() => {
        this.pending.delete(attempt);
        request.release();
        this.finalized++;
      });
    }
    return request.completion;
  }

  failure(): void {
    this.options.health.failure(
      'AUDIT_WRITE_FAILED',
      'audit.http',
      this.options.stores[0].binding.store,
    );
  }

  abort(context: Context): void {
    const request = this.requests.get(context);
    if (!request || request.completion) return;
    request.completion = Promise.resolve();
    request.release();
    this.failure();
  }

  async verifyHostProbe(probe: () => Promise<void>): Promise<void> {
    const before = this.finalized;
    await probe();
    if (this.disposed || this.finalized <= before)
      throw new AuditError('AUDIT_NOT_READY');
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await Promise.all([...this.active]);
    await Promise.all([...this.pending]);
  }

  private async persist(
    context: Context,
    request: RequestCapture,
  ): Promise<void> {
    const policy = request.policy;
    if (!policy?.enabled || policy.sources.http === 'disabled') return;
    const status = context.res.status;
    if (!request.declaration && status !== 401 && status !== 403) return;
    const store = this.stores.get(policy.observationStore);
    try {
      if (!store) throw new AuditError('AUDIT_NOT_READY');
      store.assertScope(request.scope);
      const declaration = request.declaration;
      const action =
        declaration?.action ??
        (status === 401 ? 'authentication.access' : 'authorization.access');
      const result = outcome(status, context.error, request.result);
      const normalization = {
        scope: request.scope,
        kind: 'request' as const,
        producer: 'audit.http',
        store: policy.observationStore,
        id: request.id,
        occurredAt: request.occurredAt,
        recordedAt: new Date().toISOString(),
        policyVersion: policy.revision,
      };
      const base = { action, outcome: result };
      let event = normalizeEvent(base, normalization).event;
      const warnings: string[] = [];
      for (const field of ['target', 'details'] as const) {
        try {
          const value = declaration?.[field]?.(context);
          if (value !== undefined) {
            const normalized = normalizeEvent(
              { ...base, [field]: value },
              normalization,
              { maxBytes: policy.maxDetailsBytes },
            ).event;
            event = { ...event, [field]: normalized[field] };
          }
        } catch {
          warnings.push(
            field === 'target'
              ? 'target-extraction-failed'
              : 'details-extraction-failed',
          );
        }
      }
      const reasonCode = context.error
        ? 'HTTP_HANDLER_ERROR'
        : request.result?.reasonCode;
      const complete: AuditEventDto = {
        ...event,
        ...(declaration?.titleKey ? { titleKey: declaration.titleKey } : {}),
        ...(reasonCode ? { reasonCode } : {}),
        ...(!declaration
          ? { captureWarnings: ['route-not-executed'] }
          : warnings.length
            ? { captureWarnings: warnings }
            : {}),
        http: {
          method: context.req.method,
          routePattern: request.routePattern ?? '*',
          httpStatus: status,
          durationMs: Math.max(
            0,
            Math.round(performance.now() - request.started),
          ),
        },
      };
      const receipt = await store.appendWithLimits(
        complete,
        { idempotencyKey: request.id },
        { maxBytes: policy.maxDetailsBytes },
      );
      if (receipt.state !== 'committed')
        throw new AuditError('AUDIT_WRITE_FAILED');
      this.options.health.success('audit.http', policy.observationStore);
    } catch {
      this.options.health.failure(
        'AUDIT_WRITE_FAILED',
        'audit.http',
        policy.observationStore,
      );
    }
  }
}

import type {
  AuditEventDto,
  AuditEventLookup,
  AuditEventsPage,
  AuditEventsQuery,
  AuditOperationQuery,
  ResourceRef,
} from './contracts.js';
import type {
  AuditQueryAuthorization,
  AuditQueryService,
} from './internal-contracts.js';
import { AuditAuthorization, AuditAccessDenied } from './authorization.js';
import { PortableAuditStore } from './store.js';
import { AuditError } from './errors.js';
import { encodeAuditCursor } from './store-query.js';
import { normalizeResourceRef } from './event-normalizer.js';

function invalid(): never {
  throw new AuditError('AUDIT_INVALID_EVENT');
}
function sameTarget(
  a: ResourceRef,
  b: ResourceRef,
  proof: AuditQueryAuthorization,
): boolean {
  const left = normalizeResourceRef(a, proof.scope);
  const right = normalizeResourceRef(b, proof.scope);
  return (
    left.dataSource === right.dataSource &&
    left.resource === right.resource &&
    left.keyEncoding === right.keyEncoding
  );
}
function project(event: AuditEventDto, metadata: boolean): AuditEventDto {
  if (metadata) return event;
  const {
    details: _details,
    source: _source,
    roleIds: _roles,
    captureWarnings: _warnings,
    ...result
  } = event;
  return {
    ...result,
    actor: {
      type: event.actor.type,
      ...(event.actor.id === undefined ? {} : { id: event.actor.id }),
    },
    ...(event.initiator
      ? {
          initiator: {
            type: event.initiator.type,
            ...(event.initiator.id === undefined
              ? {}
              : { id: event.initiator.id }),
          },
        }
      : {}),
    ...(event.target
      ? {
          target: {
            resource: event.target.resource,
            dataSource: event.target.dataSource,
            key: event.target.key,
          },
        }
      : {}),
  };
}

export class ScopedAuditQueryService implements AuditQueryService {
  private readonly stores: ReadonlyMap<string, PortableAuditStore>;
  constructor(
    private readonly authorization: AuditAuthorization,
    stores: readonly PortableAuditStore[],
  ) {
    this.stores = new Map(stores.map((store) => [store.binding.store, store]));
    if (this.stores.size !== stores.length)
      throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
  }
  private query(
    proof: AuditQueryAuthorization,
    query: AuditEventsQuery,
  ): AuditEventsQuery {
    const evidence = this.authorization.verify(proof);
    if (!proof.stores.includes(query.store)) throw new AuditAccessDenied();
    const store = this.stores.get(query.store);
    if (!store) throw new AuditAccessDenied();
    store.assertScope(proof.scope, query.store);
    if (
      evidence.target &&
      query.target &&
      !sameTarget(evidence.target, query.target, proof)
    )
      throw new AuditAccessDenied();
    const limit = query.pageSize ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) invalid();
    for (const time of [query.from, query.to]) {
      if (
        time !== undefined &&
        (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/.test(
          time,
        ) ||
          !Number.isFinite(Date.parse(time)) ||
          new Date(time).toISOString() !== time)
      )
        invalid();
    }
    if (query.from && query.to && query.from > query.to) invalid();
    if (query.kind && !['business', 'database', 'request'].includes(query.kind))
      invalid();
    if (
      query.outcome &&
      !['success', 'failed', 'denied', 'accepted', 'unknown'].includes(
        query.outcome,
      )
    )
      invalid();
    for (const value of [
      query.action,
      query.actorType,
      query.actorId,
      query.operationId,
      query.requestId,
      query.runId,
    ])
      if (value !== undefined && (!value || value.length > 512)) invalid();
    return {
      ...query,
      target: evidence.target ?? query.target,
      pageSize: limit,
    };
  }
  async list(
    proof: AuditQueryAuthorization,
    input: AuditEventsQuery,
  ): Promise<AuditEventsPage> {
    const query = this.query(proof, input);
    let cursor = query.cursor;
    const store = this.stores.get(query.store);
    if (!store) throw new AuditAccessDenied();
    const items: AuditEventDto[] = [];
    let lastConsumed: AuditEventDto | undefined;
    for (let scanned = 0; scanned < 10000; scanned += 100) {
      const page = await store.query(proof.scope, {
        ...query,
        cursor,
        pageSize: 100,
      });
      for (const event of page.items) {
        if (await proof.canRead(event)) {
          // Leave the authorized lookahead unconsumed, including within a batch.
          if (items.length === query.pageSize)
            return {
              items,
              ...(lastConsumed
                ? {
                    nextCursor: encodeAuditCursor(
                      proof.scope,
                      query,
                      lastConsumed,
                    ),
                  }
                : {}),
            };
          items.push(project(event, this.authorization.verify(proof).metadata));
        }
        lastConsumed = event;
      }
      if (!page.nextCursor) return { items };
      cursor = page.nextCursor;
    }
    throw new AuditError('AUDIT_NOT_READY');
  }
  async detail(
    proof: AuditQueryAuthorization,
    query: AuditEventLookup,
  ): Promise<AuditEventDto | undefined> {
    if (!query.id || query.id.length > 512) invalid();
    const filter = this.query(proof, { store: query.store });
    const store = this.stores.get(query.store);
    if (!store) throw new AuditAccessDenied();
    const event = await store.queryEvent(proof.scope, query, filter.target);
    return event && (await proof.canRead(event))
      ? project(event, this.authorization.verify(proof).metadata)
      : undefined;
  }
  async operation(
    proof: AuditQueryAuthorization,
    query: AuditOperationQuery,
  ): Promise<AuditEventsPage> {
    return this.list(proof, {
      store: query.store,
      operationId: query.id,
      cursor: query.cursor,
      pageSize: query.pageSize,
    });
  }
  async count(
    proof: AuditQueryAuthorization,
    query: AuditEventsQuery,
  ): Promise<number> {
    if (query.cursor) invalid();
    let count = 0;
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      const page = await this.list(proof, { ...query, pageSize: 100, cursor });
      count += page.items.length;
      if (!page.nextCursor) return count;
      cursor = page.nextCursor;
    }
    throw new AuditError('AUDIT_NOT_READY');
  }
}

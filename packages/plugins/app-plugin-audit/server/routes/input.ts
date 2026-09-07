import type { Context } from 'hono';
import type { AuditEventsQuery, ResourceRef } from '../contracts.js';
import { AuditError } from '../errors.js';

export function readAuditQuery(
  context: Context,
  mode: 'list' | 'detail' | 'operation' | 'settings' | 'health',
): AuditEventsQuery {
  const values = context.req.queries();
  const allowed = ['store'];
  if (mode === 'list')
    allowed.push(
      'cursor',
      'pageSize',
      'from',
      'to',
      'action',
      'kind',
      'outcome',
      'actorType',
      'actorId',
      'operationId',
      'requestId',
      'runId',
      'count',
    );
  if (mode === 'operation') allowed.push('cursor', 'pageSize');
  if (['list', 'detail', 'operation'].includes(mode)) allowed.push('target');
  if (mode === 'health') allowed.push('instanceId');
  if (
    Object.entries(values).some(
      ([key, value]) =>
        !allowed.includes(key) || value.length !== 1 || value[0].length > 12000,
    )
  )
    throw new AuditError('AUDIT_INVALID_EVENT');
  const query = context.req.query();
  if (!query.store || query.store.length > 256)
    throw new AuditError('AUDIT_INVALID_EVENT');
  let target: ResourceRef | undefined;
  if (query.target) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(query.target);
    } catch {
      throw new AuditError('AUDIT_INVALID_EVENT');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.keys(parsed).some(
        (key) => !['dataSource', 'resource', 'key'].includes(key),
      ) ||
      !('resource' in parsed) ||
      typeof parsed.resource !== 'string'
    )
      throw new AuditError('AUDIT_INVALID_EVENT');
    target = parsed as ResourceRef;
  }
  if (query.count !== undefined && query.count !== 'true')
    throw new AuditError('AUDIT_INVALID_EVENT');
  const {
    count: _count,
    instanceId: _instance,
    target: _target,
    pageSize: _size,
    ...filters
  } = query;
  return {
    ...filters,
    store: query.store,
    ...(query.pageSize === undefined
      ? {}
      : { pageSize: Number(query.pageSize) }),
    ...(target ? { target } : {}),
  };
}

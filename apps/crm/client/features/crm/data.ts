import { nocobaseClient } from '@nocobase/portal-sdk/client';

import type { CrmResourceConfig } from './resource-config';

export type CrmRecord = Record<string, unknown> & {
  id: string | number;
};

export type RelationOption = {
  id: string | number;
  [key: string]: unknown;
};

type ListEnvelope<T> = {
  data?: T[] | { rows?: T[]; count?: number };
  meta?: { count?: number };
};

type QueryEnvelope = {
  data?: unknown[] | { rows?: unknown[] };
};

const rowsFromEnvelope = <T>(payload: ListEnvelope<T>) => {
  if (Array.isArray(payload.data)) return payload.data;
  return payload.data?.rows ?? [];
};

export async function loadRelationOptions({
  resource,
  labelField,
  search,
  page,
  pageSize,
  signal,
}: {
  resource: string;
  labelField: string;
  search: string;
  page: number;
  pageSize: number;
  signal: AbortSignal;
}) {
  const payload = await nocobaseClient.action<ListEnvelope<RelationOption>>(
    resource,
    'list',
    {
      method: 'GET',
      query: {
        page,
        pageSize,
        sort: labelField,
        ...(search
          ? {
              filter: JSON.stringify({
                [labelField]: { $includes: search },
              }),
            }
          : {}),
      },
      signal,
      unwrap: 'none',
    },
  );
  const items = rowsFromEnvelope(payload);
  const count =
    payload.meta?.count ??
    (Array.isArray(payload.data) ? payload.data.length : payload.data?.count) ??
    items.length;

  return { items, hasMore: page * pageSize < count };
}

export async function queryCollection(
  resource: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const payload = await nocobaseClient.action<QueryEnvelope>(
    resource,
    'query',
    {
      method: 'POST',
      body,
      signal,
      unwrap: 'none',
    },
  );
  if (Array.isArray(payload.data)) return payload.data;
  return payload.data?.rows ?? [];
}

export function normalizeRecordValues(
  values: Record<string, unknown>,
  config: CrmResourceConfig,
) {
  const normalized: Record<string, unknown> = {};
  for (const field of config.fields) {
    let value = values[field.name];
    if (value === undefined) continue;
    if (value === '') value = null;
    if (field.kind === 'relation') {
      const relationName = field.relation!.relationName;
      if (value === null) {
        normalized[relationName] = null;
        continue;
      }
      const relationRecord = asRecord(value);
      const relationId = relationRecord?.id ?? value;
      const parsed = Number(relationId);
      normalized[relationName] = {
        id: Number.isFinite(parsed) ? parsed : relationId,
      };
      continue;
    }
    if (
      (field.kind === 'number' || field.kind === 'percent') &&
      value !== null
    ) {
      const parsed = Number(value);
      value = Number.isFinite(parsed) ? parsed : value;
    }
    normalized[field.name] = value;
  }
  return normalized;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

export function toScalarString(value: unknown, fallback: string = ''): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return fallback;
}

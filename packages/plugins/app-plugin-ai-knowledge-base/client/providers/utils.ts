import type { NocoBaseHttpError } from '@nocobase/app-portal-sdk/client';

export type PagedResult<T> = {
  rows: T[];
  count: number;
  page: number;
  pageSize: number;
};

export type KnowledgeBaseError = {
  status?: number;
  message: string;
  conflict: boolean;
  forbidden: boolean;
  unavailable: boolean;
};

type UnknownRecord = Record<string, unknown>;
type NocoBaseHttpErrorLike = Pick<
  NocoBaseHttpError,
  'message' | 'status' | 'payload'
>;
type NormalizedRuntimeError = { message: string; status?: number };

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const integer = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : fallback;

/** Normalizes the four response envelopes accepted by the public provider contract. */
export function normalizePagedResult<T>(
  payload: unknown,
  fallback: Pick<PagedResult<T>, 'page' | 'pageSize'> = {
    page: 1,
    pageSize: 20,
  },
): PagedResult<T> {
  if (Array.isArray(payload))
    return { rows: payload as T[], count: payload.length, ...fallback };
  const root = isRecord(payload) ? payload : {};
  const data = root.data;
  const nested = isRecord(data) ? data : undefined;
  const nestedData = nested?.data;
  const meta = isRecord(root.meta) ? root.meta : {};
  const nestedMeta = isRecord(nested?.meta) ? nested.meta : {};
  const rows = Array.isArray(data)
    ? (data as T[])
    : Array.isArray(nestedData)
      ? (nestedData as T[])
      : Array.isArray(nested?.rows)
        ? (nested.rows as T[])
        : Array.isArray(root.rows)
          ? (root.rows as T[])
          : [];
  const count = integer(
    nested?.count ?? nestedMeta.count ?? root.count ?? meta.count,
    rows.length,
  );
  const page = Math.max(
    1,
    integer(
      nested?.page ?? nestedMeta.page ?? root.page ?? meta.page,
      fallback.page,
    ),
  );
  const pageSize = Math.max(
    1,
    integer(
      nested?.pageSize ?? nestedMeta.pageSize ?? root.pageSize ?? meta.pageSize,
      fallback.pageSize,
    ),
  );
  return { rows, count, page, pageSize };
}

export const clampPage = (page: number, count: number, pageSize: number) =>
  Math.min(
    Math.max(1, Math.ceil(Math.max(0, count) / Math.max(1, pageSize)) || 1),
    Math.max(1, page),
  );

export const pageAfterDelete = (
  page: number,
  countBeforeDelete: number,
  pageSize: number,
) => clampPage(page, Math.max(0, countBeforeDelete - 1), pageSize);

const errorDetail = (value: unknown): UnknownRecord | undefined => {
  if (!isRecord(value)) return undefined;
  const direct = value.error;
  if (isRecord(direct)) return direct;
  const firstError = Array.isArray(value.errors)
    ? value.errors.find(isRecord)
    : undefined;
  if (firstError) return firstError;
  const firstMessage = Array.isArray(value.messages)
    ? value.messages.find(isRecord)
    : undefined;
  if (firstMessage) return firstMessage;
  return typeof value.code === 'string' ||
    typeof value.message === 'string' ||
    typeof value.maintaining === 'boolean'
    ? value
    : undefined;
};

const isNocoBaseHttpError = (
  value: unknown,
): value is NocoBaseHttpErrorLike => {
  if (!(value instanceof Error) || value.name !== 'NocoBaseHttpError')
    return false;
  const candidate = value as unknown as Partial<NocoBaseHttpErrorLike>;
  return typeof candidate.status === 'number';
};

const numberValue = (value: unknown) =>
  typeof value === 'number' ? value : undefined;
const messageValue = (value: unknown) =>
  typeof value === 'string' ? value : undefined;

const normalizeNocoBaseRuntimeError = (
  error: unknown,
): NormalizedRuntimeError => {
  if (isNocoBaseHttpError(error)) {
    const detail = errorDetail(error.payload);
    return {
      message: messageValue(detail?.message) ?? error.message,
      status: numberValue(detail?.status) ?? error.status,
    };
  }

  const detail = errorDetail(error);
  if (detail) {
    return {
      message: messageValue(detail.message) ?? 'NocoBase request failed',
      status: numberValue(detail.status),
    };
  }

  if (error instanceof Error) return { message: error.message };
  return {
    message:
      typeof error === 'string' && error ? error : 'NocoBase request failed',
  };
};

export function normalizeKnowledgeBaseError(
  error: unknown,
  fallback = 'Knowledge base request failed.',
): KnowledgeBaseError {
  const normalized = normalizeNocoBaseRuntimeError(error);
  const message =
    normalized.message && normalized.message !== 'NocoBase request failed'
      ? normalized.message
      : fallback;

  return {
    status: normalized.status,
    message,
    conflict: normalized.status === 409,
    forbidden: normalized.status === 403,
    unavailable: normalized.status === 204 || normalized.status === 404,
  };
}

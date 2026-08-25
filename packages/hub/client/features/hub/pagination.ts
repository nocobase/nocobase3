import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  hubGet,
  type HubApiError,
  type HubFetcher,
  type HubPageMeta,
  useHubQuery,
} from './api';

const DEFAULT_PAGE_SIZE = 20;

export interface HubPaginatedQueryState<T> {
  data: T[];
  meta: HubPageMeta | undefined;
  requestId: string | undefined;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: HubApiError | Error | null;
  reload: () => void;
  loadMore: () => void;
}

export interface UseHubPaginatedQueryOptions {
  path: string | null;
  fetcher?: HubFetcher;
  enabled?: boolean;
  pageSize?: number;
}

export interface HubPageQueryState<T> {
  data: T[];
  meta: HubPageMeta | undefined;
  loading: boolean;
  error: HubApiError | Error | null;
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  reload: () => void;
}

export type UseHubPageQueryOptions = UseHubPaginatedQueryOptions;

/** Controlled server-side pagination for management tables. */
export function useHubPageQuery<T>({
  path,
  fetcher,
  enabled = true,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
}: UseHubPageQueryOptions): HubPageQueryState<T> {
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const requestPath =
    path && enabled
      ? page === 1 && pageSize === DEFAULT_PAGE_SIZE
        ? path
        : withPagination(path, pageSize, (page - 1) * pageSize)
      : null;
  const query = useHubQuery<T[]>({
    path: requestPath,
    fetcher,
    enabled,
    initialData: [],
  });
  const total =
    nonNegativeInteger(query.meta?.total) ?? query.data?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const setPage = useCallback(
    (nextPage: number) => {
      setPageState(Math.min(Math.max(1, nextPage), pageCount));
    },
    [pageCount],
  );
  const setPageSize = useCallback((nextPageSize: number) => {
    setPageSizeState(Math.max(1, nextPageSize));
    setPageState(1);
  }, []);

  useEffect(() => setPageState(1), [path]);
  useEffect(() => {
    if (page > pageCount) setPageState(pageCount);
  }, [page, pageCount]);

  return useMemo(
    () => ({
      data: query.data ?? [],
      meta: query.meta,
      loading: query.loading,
      error: query.error,
      page,
      pageSize,
      pageCount,
      total,
      setPage,
      setPageSize,
      reload: query.reload,
    }),
    [page, pageCount, pageSize, query, setPage, setPageSize, total],
  );
}

/** Internal list state for Hub endpoints that expose limit/offset metadata. */
export function useHubPaginatedQuery<T>({
  path,
  fetcher,
  enabled = true,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseHubPaginatedQueryOptions): HubPaginatedQueryState<T> {
  const [data, setData] = useState<T[]>([]);
  const [meta, setMeta] = useState<HubPageMeta>();
  const [requestId, setRequestId] = useState<string>();
  const [lastPageLength, setLastPageLength] = useState(0);
  const [loading, setLoading] = useState(Boolean(path && enabled));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<HubApiError | Error | null>(null);
  const [revision, setRevision] = useState(0);
  const requestGeneration = useRef(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    loadingMoreRef.current = false;
    setLoadingMore(false);

    if (!path || !enabled) {
      setData([]);
      setMeta(undefined);
      setRequestId(undefined);
      setLastPageLength(0);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    void hubGet<T[]>(path, fetcher)
      .then((result) => {
        if (requestGeneration.current !== generation) return;
        setData(result.data);
        setMeta(result.meta);
        setRequestId(result.requestId);
        setLastPageLength(result.data.length);
      })
      .catch((reason: unknown) => {
        if (requestGeneration.current !== generation) return;
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => {
        if (requestGeneration.current === generation) setLoading(false);
      });

    return () => {
      if (requestGeneration.current === generation) {
        requestGeneration.current += 1;
      }
    };
  }, [enabled, fetcher, path, revision]);

  const limit = positiveInteger(meta?.limit) ?? pageSize;
  const pageOffset = nonNegativeInteger(meta?.offset) ?? 0;
  const total = nonNegativeInteger(meta?.total);
  const hasMore =
    total !== undefined
      ? data.length < total
      : lastPageLength >= limit && lastPageLength > 0;

  const loadMore = useCallback(() => {
    if (!path || !enabled || loading || loadingMoreRef.current || !hasMore) {
      return;
    }

    const generation = requestGeneration.current;
    const nextOffset = pageOffset + lastPageLength;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
    void hubGet<T[]>(withPagination(path, limit, nextOffset), fetcher)
      .then((result) => {
        if (requestGeneration.current !== generation) return;
        setData((current) => [...current, ...result.data]);
        setMeta(result.meta);
        setRequestId(result.requestId);
        setLastPageLength(result.data.length);
      })
      .catch((reason: unknown) => {
        if (requestGeneration.current !== generation) return;
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => {
        if (requestGeneration.current !== generation) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [
    enabled,
    fetcher,
    hasMore,
    lastPageLength,
    limit,
    loading,
    pageOffset,
    path,
  ]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  return useMemo(
    () => ({
      data,
      meta,
      requestId,
      loading,
      loadingMore,
      hasMore,
      error,
      reload,
      loadMore,
    }),
    [
      data,
      error,
      hasMore,
      loadMore,
      loading,
      loadingMore,
      meta,
      reload,
      requestId,
    ],
  );
}

function withPagination(path: string, limit: number, offset: number): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}limit=${limit}&offset=${offset}`;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKnowledgeBaseService } from '../providers/context.js';
import type { KnowledgeBaseService } from '../providers/service/knowledge-base.js';
import type { KnowledgeBase, RetrievalRequest } from '../providers/types.js';
import { serviceKey, useRequest } from './shared.js';

function useAllKnowledgeBases(service: KnowledgeBaseService | undefined) {
  return useRequest(
    ['knowledge-bases', 'all', serviceKey(service)],
    (signal) => service!.listKnowledgeBases({ mode: 'all', signal }),
    !!service,
  );
}

function usePaginatedKnowledgeBases(
  request: { page: number; pageSize: number; query?: string },
  service: KnowledgeBaseService | undefined,
) {
  const key = useMemo(
    () => [
      'knowledge-bases',
      request.page,
      request.pageSize,
      request.query,
      serviceKey(service),
    ],
    [request.page, request.pageSize, request.query, service],
  );
  return useRequest(
    key,
    (signal) =>
      service!.listKnowledgeBases({ mode: 'server', ...request, signal }),
    !!service,
  );
}

type InfiniteKnowledgeBaseRequest = {
  pageSize: number;
  query?: string;
};

/** Accumulates server pages for card directories while keeping query/service changes stale-safe. */
function useInfiniteKnowledgeBases(
  request: InfiniteKnowledgeBaseRequest,
  service: KnowledgeBaseService | undefined,
) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<KnowledgeBase[]>([]);
  const [count, setCount] = useState<number>();
  const resetKey = useMemo(
    () =>
      JSON.stringify([
        serviceKey(service),
        request.pageSize,
        request.query ?? '',
      ]),
    [request.pageSize, request.query, service],
  );
  const resetKeyRef = useRef(resetKey);
  const resetPending = resetKeyRef.current !== resetKey;
  const loadMoreLock = useRef(false);
  const result = usePaginatedKnowledgeBases(
    { page, pageSize: request.pageSize, query: request.query },
    service,
  );

  useEffect(() => {
    if (!resetPending) return;
    resetKeyRef.current = resetKey;
    loadMoreLock.current = false;
    setPage(1);
    setRows([]);
    setCount(undefined);
  }, [resetKey, resetPending]);

  useEffect(() => {
    const data = result.data;
    if (resetPending || !data) return;
    setCount(data.count);
    setRows((currentRows) => {
      if (page === 1) return data.rows;
      const knownIds = new Set(currentRows.map((item) => item.id));
      const nextRows = data.rows.filter((item) => {
        if (knownIds.has(item.id)) return false;
        knownIds.add(item.id);
        return true;
      });
      return [...currentRows, ...nextRows];
    });
  }, [page, resetPending, result.data]);

  useEffect(() => {
    if (!result.loading) loadMoreLock.current = false;
  }, [result.loading]);

  const visibleRows = resetPending ? [] : rows;
  const visibleCount = resetPending ? undefined : count;
  const hasMore =
    visibleCount !== undefined && visibleRows.length < visibleCount;
  const loadMore = useCallback(() => {
    if (!hasMore || result.loading || result.error || loadMoreLock.current)
      return;
    loadMoreLock.current = true;
    setPage((currentPage) => currentPage + 1);
  }, [hasMore, result.error, result.loading]);

  return {
    rows: visibleRows,
    count: visibleCount ?? visibleRows.length,
    loading: resetPending || (result.loading && visibleRows.length === 0),
    loadingMore: !resetPending && result.loading && visibleRows.length > 0,
    error: resetPending ? undefined : result.error,
    hasMore,
    loadMore,
    retry: result.retry,
  };
}

function useKnowledgeBaseRetrieval(
  request: RetrievalRequest | undefined,
  service: KnowledgeBaseService | undefined,
) {
  return useRequest(
    [
      'retrieval',
      request?.knowledgeBaseKey,
      request?.query,
      request?.topK,
      request?.score,
      serviceKey(service),
    ],
    (signal) => service!.runRetrieval({ ...request!, signal }),
    !!service && !!request?.knowledgeBaseKey && !!request?.query.trim(),
  );
}

export type KnowledgeBaseDirectoryOptions = {
  mode?: 'all' | 'paginated' | 'infinite';
  page?: number;
  pageSize?: number;
  query?: string;
  enabled?: boolean;
};

export type UseKnowledgeBaseOptions = {
  knowledgeBaseKey?: string;
  knowledgeBase?: KnowledgeBase;
  directory?: KnowledgeBaseDirectoryOptions;
  retrieval?: Omit<RetrievalRequest, 'knowledgeBaseKey' | 'signal'> & {
    enabled?: boolean;
  };
};

/** Knowledge-base-level state: directory, detail, and retrieval. */
export function useKnowledgeBase(options: UseKnowledgeBaseOptions = {}) {
  const service = useKnowledgeBaseService();
  const suppliedKnowledgeBase = options.knowledgeBase;
  const knowledgeBaseKey =
    suppliedKnowledgeBase?.key ?? options.knowledgeBaseKey;
  const directoryMode = options.directory?.mode;
  const directoryEnabled = options.directory?.enabled !== false;
  const directoryPage = options.directory?.page ?? 1;
  const directoryPageSize = options.directory?.pageSize ?? 20;
  const directoryQuery = options.directory?.query;
  const directoryAll = useAllKnowledgeBases(
    directoryMode === 'all' && directoryEnabled ? service : undefined,
  );
  const directoryPaginated = usePaginatedKnowledgeBases(
    { page: directoryPage, pageSize: directoryPageSize, query: directoryQuery },
    directoryMode === 'paginated' && directoryEnabled ? service : undefined,
  );
  const directoryInfinite = useInfiniteKnowledgeBases(
    { pageSize: directoryPageSize, query: directoryQuery },
    directoryMode === 'infinite' && directoryEnabled ? service : undefined,
  );

  const requestedDetail = useRequest(
    ['knowledge-base', knowledgeBaseKey, serviceKey(service)],
    (signal) => service.getKnowledgeBase(knowledgeBaseKey!, signal),
    !!knowledgeBaseKey && !suppliedKnowledgeBase,
  );
  const detail = suppliedKnowledgeBase
    ? {
        data: suppliedKnowledgeBase,
        loading: false,
        retry: requestedDetail.retry,
      }
    : requestedDetail;
  const retrievalEnabled =
    options.retrieval?.enabled !== false &&
    !!detail.data?.key &&
    !!options.retrieval?.query.trim();
  const retrieval = useKnowledgeBaseRetrieval(
    retrievalEnabled
      ? {
          knowledgeBaseKey: detail.data!.key,
          query: options.retrieval!.query,
          topK: options.retrieval?.topK,
          score: options.retrieval?.score,
        }
      : undefined,
    retrievalEnabled ? service : undefined,
  );

  return {
    service,
    knowledgeBase: detail,
    directory: {
      all: directoryAll,
      paginated: directoryPaginated,
      infinite: directoryInfinite,
    },
    retrieval,
  };
}

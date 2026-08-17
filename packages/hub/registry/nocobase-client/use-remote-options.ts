import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  RemoteSelectLoadParams,
  RemoteSelectLoadResult,
} from "./types";

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeout);
  }, [delay, value]);

  return [debouncedValue, setDebouncedValue] as const;
}

function mergeOptionPages<TOption>(
  pages: RemoteSelectLoadResult<TOption>[],
  getOptionKey: (option: TOption) => string | number
) {
  const options = new Map<string | number, TOption>();
  for (const page of pages) {
    for (const option of page.items) {
      options.set(getOptionKey(option), option);
    }
  }
  return [...options.values()];
}

export function useRemoteOptions<TOption>({
  debounceMs,
  getOptionKey,
  loadOptions,
  open,
  pageSize,
  requestKey,
  search,
  selectId,
}: {
  debounceMs: number;
  getOptionKey: (option: TOption) => string | number;
  loadOptions: (
    params: RemoteSelectLoadParams
  ) => Promise<RemoteSelectLoadResult<TOption>>;
  open: boolean;
  pageSize: number;
  requestKey: readonly unknown[];
  search: string;
  selectId: string;
}) {
  const [debouncedSearch, setDebouncedSearch] = useDebouncedValue(
    search.trim(),
    debounceMs
  );
  const query = useInfiniteQuery({
    queryKey: [
      "nocobase-remote-select",
      selectId,
      ...requestKey,
      pageSize,
      debouncedSearch,
    ],
    enabled: open,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      loadOptions({
        page: pageParam,
        pageSize,
        search: debouncedSearch,
        signal,
      }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length + 1 : undefined,
    retry: false,
  });
  const options = useMemo(
    () => mergeOptionPages(query.data?.pages ?? [], getOptionKey),
    [getOptionKey, query.data?.pages]
  );
  const loading = query.isPending && query.isFetching;
  const loadingMore = query.isFetchingNextPage;

  const retry = () => {
    if (query.isFetchNextPageError) {
      void query.fetchNextPage();
      return;
    }
    void query.refetch();
  };
  const resetSearch = useCallback(
    () => setDebouncedSearch(""),
    [setDebouncedSearch]
  );

  return {
    error: query.error,
    hasMore: query.hasNextPage,
    loading,
    loadingMore,
    loadMore: () => void query.fetchNextPage(),
    options,
    resetSearch,
    retry,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { MailBoxType, MailListParams, MailMessage, MailScope } from "./types";
import { mailApi } from "./mail-api";

export interface UseMailMessagesOptions {
  scope?: MailScope;
  boxType?: MailBoxType;
  search?: string;
  labelId?: number;
  isRead?: boolean;
  userId?: number;
  filter?: Record<string, unknown>;
  sort?: string;
  pageSize?: number;
  debounceMs?: number;
}

export interface UseMailMessagesResult {
  messages: MailMessage[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  refresh: () => void;
  setMessages: React.Dispatch<React.SetStateAction<MailMessage[]>>;
}

export function useMailMessages(options: UseMailMessagesOptions = {}): UseMailMessagesResult {
  const {
    scope,
    boxType,
    search = "",
    labelId,
    isRead,
    userId,
    filter,
    sort,
    pageSize = 20,
    debounceMs = 300,
  } = options;

  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const requestSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), debounceMs);
    return () => clearTimeout(timer);
  }, [search, debounceMs]);

  useEffect(() => {
    setPage(1);
  }, [scope, boxType, debouncedSearch, labelId, isRead, userId, filter, pageSize]);

  const filterKey = useMemo(() => JSON.stringify(filter ?? {}), [filter]);

  const load = useCallback(
    async (targetPage: number) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      try {
        const params: MailListParams = {
          scope,
          boxType,
          search: debouncedSearch || undefined,
          labelId,
          isRead,
          userId,
          filter: JSON.parse(filterKey),
          sort,
          page: targetPage,
          pageSize,
        };
        const res = await mailApi.listMessages(params);
        if (seq !== requestSeq.current) return;
        setMessages(res.rows);
        setTotal(res.count);
      } catch (error) {
        if (seq !== requestSeq.current) return;
        toast.error(error instanceof Error ? error.message : "Failed to load messages");
        setMessages([]);
        setTotal(0);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [scope, boxType, debouncedSearch, labelId, isRead, userId, filterKey, sort, pageSize]
  );

  useEffect(() => {
    load(page);
  }, [load, page]);

  const refresh = useCallback(() => {
    load(page);
  }, [load, page]);

  return {
    messages,
    total,
    loading,
    page,
    pageSize,
    setPage,
    refresh,
    setMessages,
  };
}

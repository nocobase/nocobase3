import { useCallback, useEffect, useRef, useState } from 'react';
import type { KnowledgeBaseService } from '../providers/service/knowledge-base.js';

const serviceIds = new WeakMap<object, number>();
let nextServiceId = 1;

/** Preserves injected service identity inside request keys without serializing its methods. */
export const getKnowledgeBaseServiceKey = (service: object) => {
  const known = serviceIds.get(service);
  if (known) return known;
  const id = nextServiceId++;
  serviceIds.set(service, id);
  return id;
};

export const serviceKey = (service: KnowledgeBaseService | undefined) =>
  service ? getKnowledgeBaseServiceKey(service) : 'unconfigured';

export type AsyncState<T> = {
  data?: T;
  error?: unknown;
  loading: boolean;
  retry: () => void;
};

/** Drops old responses and clears previous data when a logical resource changes. */
export function useRequest<T>(
  key: unknown,
  request: (signal: AbortSignal) => Promise<T>,
  enabled = true,
): AsyncState<T> {
  const sequence = useRef(0);
  const [state, setState] = useState<Omit<AsyncState<T>, 'retry'>>({
    loading: enabled,
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  // Logical values, not freshly allocated arrays/objects, drive this lifecycle.
  const logicalKey = JSON.stringify(key);

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false });
      return;
    }

    const controller = new AbortController();
    const id = ++sequence.current;
    // Never let a prior base, document, segment, or retrieval result render as current.
    setState({ loading: true });

    void request(controller.signal).then(
      (data) => {
        if (sequence.current === id && !controller.signal.aborted) {
          setState({ data, loading: false });
        }
      },
      (error) => {
        if (sequence.current === id && !controller.signal.aborted) {
          setState({ error, loading: false });
        }
      },
    );

    return () => controller.abort();
    // request is intentionally keyed by logicalKey so render-created callbacks cannot restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, enabled, logicalKey]);

  return { ...state, retry };
}

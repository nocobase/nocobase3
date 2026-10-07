import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from './api.js';

/**
 * Loads once when `key` changes and returns a `reload` for after an action.
 * A failed load keeps the last data. Background changes require a page refresh.
 */
export function useLoader<T>(
  load: (() => Promise<T>) | undefined,
  key: string,
): {
  readonly data: T | undefined;
  readonly error: string;
  readonly reload: () => Promise<void>;
} {
  // Data is kept with the key it was loaded for, so switching records never
  // shows the previous record's data.
  const [loaded, setLoaded] = useState<{ key: string; data: T } | undefined>();
  const [error, setError] = useState('');
  const reload = useCallback(async (): Promise<void> => {
    if (!load) return;
    try {
      const data = await load();
      setLoaded({ key, data });
      setError('');
    } catch (cause) {
      setError(errorMessage(cause));
    }
    // `key` stands for everything `load` closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [key]);
  useEffect(() => {
    // Defer the initial load until after the effect has been set up.
    const first = setTimeout(() => void reload(), 0);
    return () => {
      clearTimeout(first);
    };
  }, [reload]);
  return {
    data: loaded?.key === key ? loaded.data : undefined,
    error,
    reload,
  };
}

import {
  apiClientToken,
  ApiClientError,
  useService,
} from '@nocobase/app-client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { useEffect, useState } from 'react';

export function useExample<T>(path: string): {
  data?: T;
  error: string;
  loading: boolean;
  reload: () => void;
} {
  const api = useService(apiClientToken);
  const revision = useAuthorizationRevision();
  const [refresh, setRefresh] = useState(0);
  const key = `${path}:${revision}:${refresh}`;
  const [state, setState] = useState<{
    key?: string;
    data?: T;
    error: string;
    loading: boolean;
  }>({ error: '', loading: true });
  useEffect(() => {
    let active = true;
    void api
      .request<{ data: T }>({
        method: 'GET',
        path: `/authorization-example/${path}`,
      })
      .then((result) => {
        if (active)
          setState({ key, data: result.data, error: '', loading: false });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            key,
            error:
              error instanceof ApiClientError && error.status === 403
                ? 'forbidden'
                : 'error',
            loading: false,
          });
      });
    return () => {
      active = false;
    };
  }, [api, path, key]);
  return {
    ...(state.key === key
      ? state
      : { data: undefined, error: '', loading: true }),
    reload: () => setRefresh((value) => value + 1),
  };
}

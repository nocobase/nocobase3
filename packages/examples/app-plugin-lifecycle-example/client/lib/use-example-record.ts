import { useMemo } from 'react';
import { useApiClient } from '@nocobase/app-client';
import {
  createLifecycleClient,
  useLifecycle,
  type LifecycleClient,
  type UseLifecycleResult,
} from '@nocobase/lifecycle/react';

import {
  errorMessage,
  LIFECYCLE_ROUTES,
  type LifecycleName,
  type RecordDetail,
} from './api.js';

export interface ExampleRecord {
  /** The record, what the actor may do, its history and its lifecycle's description. */
  readonly detail: RecordDetail | undefined;
  readonly error: string;
  readonly lifecycle: UseLifecycleResult;
  /** For firing on a record the page has not selected yet, such as one just created. */
  readonly client: LifecycleClient;
}

/**
 * One record of the example's lifecycles, as the person the page acts as
 * sees it. The application's API client is the transport: the library needs
 * nothing else from it.
 */
export function useExampleRecord(
  name: LifecycleName,
  id: string | undefined,
  actor: string,
): ExampleRecord {
  const api = useApiClient();
  const client = useMemo(
    () =>
      createLifecycleClient({
        transport: api,
        basePath: LIFECYCLE_ROUTES,
        query: { actAs: actor },
      }),
    [api, actor],
  );
  const lifecycle = useLifecycle(client, name, id);
  const { view, description } = lifecycle;
  return {
    detail: view && description ? { ...view, ...description } : undefined,
    error: lifecycle.error ? errorMessage(lifecycle.error) : '',
    lifecycle,
    client,
  };
}

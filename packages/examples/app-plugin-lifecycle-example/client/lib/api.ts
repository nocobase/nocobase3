import type { ApiClient } from '@nocobase/app-client';
import type {
  LifecycleDescriptionView,
  RecordView,
} from '@nocobase/lifecycle/react';

export type {
  AvailableTransition as Available,
  Blocker,
  EffectRun,
  TransitionEntry,
} from '@nocobase/lifecycle/react';

export type Plain = Record<string, unknown>;
export type LifecycleName = 'tickets' | 'expenses';

/** The transition name of the log entry that records a creation. */
export const CREATE_TRANSITION = '$create';

/** Where the plugin mounts the library's record routes. */
export const LIFECYCLE_ROUTES = 'lifecycle-example/lifecycles';

/** One record as a page shows it: the library's view and its lifecycle's description. */
export type RecordDetail = RecordView & LifecycleDescriptionView;

export interface RecordList {
  readonly records: readonly Plain[];
  readonly parameters: Readonly<Record<string, unknown>>;
}

const base = 'lifecycle-example';

/** The plugin's own routes: lists and forms. A record's view and its transitions go through `useExampleRecord`. */
export function exampleApi(client: ApiClient): {
  list(name: LifecycleName, actAs: string, view?: string): Promise<RecordList>;
  create(name: LifecycleName, actAs: string, values: Plain): Promise<Plain>;
  update(
    name: LifecycleName,
    id: string,
    actAs: string,
    values: Plain,
  ): Promise<void>;
  runTriggers(): Promise<number>;
} {
  return {
    list: (name, actAs, view) =>
      client.request<RecordList>({
        path: `${base}/${name}`,
        query: { actAs, ...(view ? { view } : {}) },
      }),
    create: (name, actAs, values) =>
      client.request<Plain>({
        method: 'POST',
        path: `${base}/${name}`,
        json: { ...values, actAs },
      }),
    update: async (name, id, actAs, values) => {
      await client.request({
        method: 'PUT',
        path: `${base}/${name}/${encodeURIComponent(id)}`,
        json: { ...values, actAs },
      });
    },
    runTriggers: async () =>
      (
        await client.request<{ fired: number }>({
          method: 'POST',
          path: `${base}/triggers/run`,
        })
      ).fired,
  };
}

export function errorMessage(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null) {
    const payload = (cause as { payload?: unknown }).payload;
    if (typeof payload === 'object' && payload !== null && 'message' in payload)
      return String(payload.message);
  }
  return cause instanceof Error ? cause.message : String(cause);
}

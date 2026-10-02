import type { ApiClient } from '@nocobase/app-client';

export type Plain = Record<string, unknown>;
export type LifecycleName = 'tickets' | 'expenses';

export interface TransitionEntry {
  readonly id: string;
  readonly transition: string;
  readonly from: string;
  readonly to: string;
  readonly actorId: string;
  readonly input: Plain;
  readonly at: string;
}

export interface EffectRun {
  readonly id: string;
  readonly transitionId: string;
  readonly effect: string;
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly result: unknown;
  readonly error: string | null;
}

export interface Available {
  readonly name: string;
  readonly title: string;
  readonly to: readonly string[];
  readonly allowed: boolean;
}

/** Mirrors the server's `RecordDetail`; the client imports no server code. */
export interface RecordDetail {
  readonly record: Plain;
  readonly available: readonly Available[];
  readonly history: {
    readonly transitions: readonly TransitionEntry[];
    readonly effectRuns: readonly EffectRun[];
  };
  readonly description: {
    readonly states: readonly string[];
    readonly transitions: readonly {
      readonly name: string;
      readonly title: string;
    }[];
    readonly triggers: readonly {
      readonly name: string;
      readonly transition: string;
      readonly when: readonly string[];
    }[];
  };
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface RecordList {
  readonly records: readonly Plain[];
  readonly parameters: Readonly<Record<string, unknown>>;
}

const base = 'lifecycle-example';

export function exampleApi(client: ApiClient): {
  list(name: LifecycleName, actAs: string, view?: string): Promise<RecordList>;
  detail(name: LifecycleName, id: string, actAs: string): Promise<RecordDetail>;
  create(name: LifecycleName, actAs: string, values: Plain): Promise<Plain>;
  update(
    name: LifecycleName,
    id: string,
    actAs: string,
    values: Plain,
  ): Promise<void>;
  fire(
    name: LifecycleName,
    id: string,
    actAs: string,
    transition: string,
    input?: Plain,
  ): Promise<RecordDetail>;
  runTriggers(): Promise<number>;
} {
  return {
    list: (name, actAs, view) =>
      client.request<RecordList>({
        path: `${base}/${name}`,
        query: { actAs, ...(view ? { view } : {}) },
      }),
    detail: (name, id, actAs) =>
      client.request<RecordDetail>({
        path: `${base}/${name}/${encodeURIComponent(id)}`,
        query: { actAs },
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
    fire: (name, id, actAs, transition, input = {}) =>
      client.request<RecordDetail>({
        method: 'POST',
        path: `${base}/${name}/${encodeURIComponent(id)}/fire`,
        json: { actAs, transition, input },
      }),
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

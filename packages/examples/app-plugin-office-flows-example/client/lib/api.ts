import type { ApiClient } from '@nocobase/app-client';

export type Plain = Record<string, unknown>;

/** Mirrors the server's `LifecycleDescription`; the client imports no server code. */
export interface Description {
  readonly name: string;
  readonly states: readonly string[];
  readonly transitions: readonly {
    readonly name: string;
    readonly title: string;
  }[];
}

export interface Available {
  readonly name: string;
  readonly title: string;
  readonly allowed: boolean;
}

export interface TransitionEntry {
  readonly id: string;
  readonly transition: string;
  /** Null on the entry that records the creation. */
  readonly from: string | null;
  readonly to: string;
  readonly actorId: string;
  readonly input: Plain;
  readonly at: string;
}

export interface EffectRun {
  readonly id: string;
  readonly transitionId: string;
  readonly effect: string;
  readonly status:
    'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'cancelled';
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly error: string | null;
}

export interface Trace {
  readonly id: number | string;
  readonly actorId: string;
  readonly action: string;
  readonly detail: Plain;
  readonly at: string;
}

export interface RecordView {
  readonly record: Plain;
  readonly description: Description;
  readonly available: readonly Available[];
  readonly history: {
    readonly transitions: readonly TransitionEntry[];
    readonly effectRuns: readonly EffectRun[];
  };
  readonly traces: readonly Trace[];
}

export interface ProcessingLevel {
  readonly title: string;
  readonly opinionLabel: string;
  readonly opinion: string;
  readonly kind: TaskKind;
  readonly tasks: readonly Plain[];
}

export type TaskKind = 'clerk' | 'team' | 'executor';

export interface Config {
  readonly departments: readonly {
    readonly id: number;
    readonly name: string;
    readonly clerks: readonly string[];
    readonly heads: readonly string[];
    readonly leaders: readonly string[];
  }[];
  readonly managementGroups: readonly {
    readonly id: number;
    readonly name: string;
    readonly members: readonly string[];
  }[];
  readonly holidays: readonly {
    readonly date: string;
    readonly kind: string;
    readonly name: string;
  }[];
}

/** The transition name of the log entry that records a creation. */
export const CREATE_TRANSITION = '$create';

const base = 'office-flows';

/** One place that knows the paths, so pages read as what they do. */
export function api(client: ApiClient): {
  get<T>(path: string, actAs?: string): Promise<T>;
  post<T = void>(path: string, json: Plain): Promise<T>;
  put(path: string, json: Plain): Promise<void>;
  remove(path: string, actAs: string): Promise<void>;
} {
  return {
    get: <T>(path: string, actAs?: string): Promise<T> =>
      client.request<T>({
        path: `${base}/${path}`,
        ...(actAs ? { query: { actAs } } : {}),
      }),
    post: <T = void>(path: string, json: Plain): Promise<T> =>
      client.request<T>({ method: 'POST', path: `${base}/${path}`, json }),
    put: async (path: string, json: Plain): Promise<void> => {
      await client.request({ method: 'PUT', path: `${base}/${path}`, json });
    },
    remove: async (path: string, actAs: string): Promise<void> => {
      await client.request({
        method: 'DELETE',
        path: `${base}/${path}`,
        query: { actAs },
      });
    },
  };
}

export function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function errorMessage(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null) {
    const payload = (cause as { payload?: unknown }).payload;
    if (typeof payload === 'object' && payload !== null && 'message' in payload)
      return String(payload.message);
  }
  return cause instanceof Error ? cause.message : String(cause);
}

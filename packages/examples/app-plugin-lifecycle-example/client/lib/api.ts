import type { ApiClient } from '@nocobase/app-client';

import { LIFECYCLE_ROUTES } from '../../shared/routes.js';
import type {
  Blocker,
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

/** One record as a page shows it: the library's view and its lifecycle's description. */
export type RecordDetail = RecordView & LifecycleDescriptionView;

export interface RecordList {
  readonly records: readonly Plain[];
  readonly parameters: Readonly<Record<string, unknown>>;
}

const base = LIFECYCLE_ROUTES;

/** Lists show at most this many records; the routes page by it. */
const PAGE_SIZE = 100;

/** The plugin's own routes: lists and forms. A record's view and its transitions go through `useExampleLifecycle`. */
export function exampleApi(client: ApiClient): {
  list(name: LifecycleName, actAs: string, view?: string): Promise<RecordList>;
  create(name: LifecycleName, actAs: string, values: Plain): Promise<Plain>;
  update(
    name: LifecycleName,
    id: string,
    actAs: string,
    values: Plain,
  ): Promise<Plain>;
  runTriggers(): Promise<number>;
} {
  return {
    list: async (name, actAs, view) => {
      const { data, meta } = await client.request<{
        readonly data: readonly Plain[];
        readonly meta: {
          readonly parameters: Readonly<Record<string, unknown>>;
        };
      }>({
        path: `${base}/${name}`,
        query: {
          actAs,
          pageSize: String(PAGE_SIZE),
          ...(view ? { view } : {}),
        },
      });
      return { records: data, parameters: meta.parameters };
    },
    create: async (name, actAs, values) =>
      (
        await client.request<{ readonly data: Plain }>({
          method: 'POST',
          path: `${base}/${name}`,
          query: { actAs },
          json: values,
        })
      ).data,
    update: async (name, id, actAs, values) =>
      (
        await client.request<{ readonly data: Plain }>({
          method: 'PATCH',
          path: `${base}/${name}/${encodeURIComponent(id)}`,
          query: { actAs },
          json: values,
        })
      ).data,
    runTriggers: async () =>
      (
        await client.request<{ readonly data: { readonly fired: number } }>({
          method: 'POST',
          path: `${base}/runTriggers`,
        })
      ).data.fired,
  };
}

/** Looks a key up in the page's locale, answering `fallback` when it has none. */
export type Translate = (key: string, fallback: string) => string;

const asIs: Translate = (_key, fallback) => fallback;

/** The standard error body's `error`, with the lifecycle's reasons in `metadata`. */
interface RefusalBody {
  readonly reason?: unknown;
  readonly message?: unknown;
  readonly metadata?: {
    readonly blockers?: unknown;
    readonly problems?: unknown;
  };
}

function payloadOf(cause: unknown): RefusalBody | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined;
  const payload = (cause as { payload?: { error?: unknown } }).payload;
  const body = payload?.error;
  return typeof body === 'object' && body !== null ? body : undefined;
}

/** A guard's refusal in the page's language, by its code; its English message otherwise. */
export function blockerMessage(
  blocker: Blocker,
  translate: Translate = asIs,
): string {
  return translate(`blockers.${blocker.code}`, blocker.message);
}

function problemMessage(
  problem: { readonly field?: string; readonly message: string },
  translate: Translate,
): string {
  return problem.field
    ? translate(`problems.${problem.field}`, problem.message)
    : problem.message;
}

/**
 * What to tell the person about a failed request. The server answers in
 * English with stable codes — a guard's `code`, a problem's `field`, the
 * error's `reason` — and the page's locale translates what it knows.
 */
export function errorMessage(
  cause: unknown,
  translate: Translate = asIs,
): string {
  const payload = payloadOf(cause);
  if (payload) {
    const blockers = Array.isArray(payload.metadata?.blockers)
      ? (payload.metadata.blockers as Blocker[])
      : [];
    if (blockers.length)
      return blockers
        .map((blocker) => blockerMessage(blocker, translate))
        .join(' ');
    const problems = Array.isArray(payload.metadata?.problems)
      ? (payload.metadata.problems as { field?: string; message: string }[])
      : [];
    if (problems.length)
      return problems
        .map((problem) => problemMessage(problem, translate))
        .join(' ');
    if (typeof payload.message === 'string')
      return typeof payload.reason === 'string'
        ? translate(`errors.${payload.reason}`, payload.message)
        : payload.message;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

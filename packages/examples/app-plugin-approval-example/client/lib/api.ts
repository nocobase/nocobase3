import { useApiClient, type ApiClient } from '@nocobase/app-client';
import {
  createLifecycleClient,
  createLifecycleHook,
  LifecycleRequestError,
  type Blocker,
  type JsonObject,
} from '@nocobase/lifecycle/react';

import { EXAMPLE_ROUTES, LIFECYCLE_ROUTES } from '../../shared/routes.js';
import type {
  Created,
  LabSettings,
  Overview,
  Preview,
  RecordDetail,
} from '../../shared/types.js';

export const NAMESPACE = '@nocobase/app-plugin-approval-example';

/** The example's routes, every one acting as the chosen persona. */
export interface ExampleApi {
  overview(actAs: string): Promise<Overview>;
  detail(lifecycle: string, id: string, actAs: string): Promise<RecordDetail>;
  preview(demo: string, form: JsonObject, actAs: string): Promise<Preview>;
  create(demo: string, form: JsonObject, actAs: string): Promise<Created>;
  /** A business transition, through the plugin's lifecycle route. */
  fire(
    lifecycle: string,
    id: string,
    transition: string,
    input: JsonObject,
    actAs: string,
    expectVersion?: number | null,
  ): Promise<void>;
  task(
    taskId: string,
    action: string,
    body: JsonObject,
    actAs: string,
  ): Promise<JsonObject>;
  record(
    lifecycle: string,
    id: string,
    action: string,
    body: JsonObject,
    actAs: string,
  ): Promise<JsonObject>;
  simulate(
    event: string,
    id: string,
    body: JsonObject,
    actAs: string,
  ): Promise<JsonObject>;
  operate(
    lifecycle: string,
    id: string,
    runId: string,
    action: 'retry' | 'cancel',
    actAs: string,
  ): Promise<void>;
  samples(actAs: string): Promise<number>;
  sweep(actAs: string): Promise<number>;
  saveSettings(settings: LabSettings, actAs: string): Promise<void>;
}

export const useLifecycle: ReturnType<typeof createLifecycleHook> =
  createLifecycleHook({
    useTransport: useApiClient,
    basePath: LIFECYCLE_ROUTES,
  });

const base = EXAMPLE_ROUTES;

export function exampleApi(client: ApiClient): ExampleApi {
  const post = <T>(path: string, actAs: string, json: unknown = {}) =>
    client
      .request<{ data: T }>({ method: 'POST', path, query: { actAs }, json })
      .then((response) => response.data);
  return {
    overview: (actAs) =>
      client
        .request<{ data: Overview }>({
          path: `${base}/overview`,
          query: { actAs },
        })
        .then((response) => response.data),
    detail: (lifecycle, id, actAs) =>
      client
        .request<{ data: RecordDetail }>({
          path: `${base}/records/${lifecycle}/${encodeURIComponent(id)}`,
          query: { actAs },
        })
        .then((response) => response.data),
    preview: (demo, form, actAs) =>
      post<Preview>(`${base}/preview/${demo}`, actAs, form),
    create: (demo, form, actAs) =>
      post<Created>(`${base}/requests/${demo}`, actAs, form),
    fire: async (lifecycle, id, transition, input, actAs, expectVersion) => {
      await createLifecycleClient({
        transport: client,
        basePath: LIFECYCLE_ROUTES,
        query: { actAs },
      }).fire(lifecycle, id, transition, {
        input,
        ...(expectVersion === undefined ? {} : { expectVersion }),
      });
    },
    task: (taskId, action, body, actAs) =>
      post<JsonObject>(
        `${base}/tasks/${encodeURIComponent(taskId)}/${action}`,
        actAs,
        body,
      ),
    record: (lifecycle, id, action, body, actAs) =>
      post<JsonObject>(
        `${base}/records/${lifecycle}/${encodeURIComponent(id)}/${action}`,
        actAs,
        body,
      ),
    simulate: (event, id, body, actAs) =>
      post<JsonObject>(
        `${base}/events/${event}/${encodeURIComponent(id)}`,
        actAs,
        body,
      ),
    operate: async (lifecycle, id, runId, action, actAs) => {
      const lifecycleClient = createLifecycleClient({
        transport: client,
        basePath: LIFECYCLE_ROUTES,
        query: { actAs },
      });
      if (action === 'retry')
        await lifecycleClient.retryRun(lifecycle, id, runId);
      else await lifecycleClient.cancelRun(lifecycle, id, runId);
    },
    samples: async (actAs) =>
      (await post<{ created: number }>(`${base}/samples`, actAs)).created,
    sweep: async (actAs) =>
      (await post<{ moved: number }>(`${base}/sweep`, actAs)).moved,
    saveSettings: async (settings, actAs) => {
      await client.request({
        method: 'PATCH',
        path: `${base}/settings`,
        query: { actAs },
        json: settings,
      });
    },
  };
}

/** Looks a key up in the page's locale, answering `fallback` when it has none. */
export type Translate = (key: string, fallback: string) => string;

const asIs: Translate = (_key, fallback) => fallback;

interface RefusalPayload {
  readonly code?: unknown;
  readonly reason?: unknown;
  readonly message?: unknown;
  readonly blockers?: unknown;
  readonly problems?: unknown;
}

function payloadOf(cause: unknown): RefusalPayload | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined;
  if (cause instanceof LifecycleRequestError)
    return {
      reason: cause.reason,
      message: cause.message,
      blockers: cause.blockers,
      problems: cause.problems,
    };
  const envelope = (
    cause as {
      payload?: {
        error?: RefusalPayload & {
          metadata?: { blockers?: unknown; problems?: unknown };
        };
      };
    }
  ).payload;
  const error = envelope?.error;
  const payload = error
    ? {
        ...error,
        blockers: error.metadata?.blockers,
        problems: error.metadata?.problems,
      }
    : undefined;
  return typeof payload === 'object' && payload !== null ? payload : undefined;
}

/** A guard's refusal in the page's language, by its code; its English message otherwise. */
export function blockerMessage(
  blocker: Blocker,
  translate: Translate = asIs,
): string {
  return translate(`blockers.${blocker.code}`, blocker.message);
}

/**
 * What to tell the person about a failed request. The server answers in
 * English with stable codes — a guard's `code`, the approval layer's `code`,
 * a problem's `field` — and the page's locale translates what it knows.
 */
export function errorMessage(
  cause: unknown,
  translate: Translate = asIs,
): string {
  const payload = payloadOf(cause);
  if (payload) {
    const blockers = Array.isArray(payload.blockers)
      ? (payload.blockers as Blocker[])
      : [];
    if (blockers.length)
      return blockers
        .map((blocker) => blockerMessage(blocker, translate))
        .join(' ');
    const problems = Array.isArray(payload.problems)
      ? (payload.problems as { field?: string; message: string }[])
      : [];
    if (problems.length)
      return problems
        .map((problem) =>
          problem.field
            ? translate(`problems.${problem.field}`, problem.message)
            : problem.message,
        )
        .join(' ');
    if (typeof payload.message === 'string') {
      if (typeof payload.reason === 'string')
        return translate(`errors.${payload.reason}`, payload.message);
      if (typeof payload.code === 'string')
        return translate(`errors.${payload.code}`, payload.message);
      return payload.message;
    }
  }
  return cause instanceof Error ? cause.message : String(cause);
}

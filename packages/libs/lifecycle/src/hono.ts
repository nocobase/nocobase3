import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { toMermaid } from './mermaid.js';
import { LifecycleError, type LifecycleErrorCode } from './errors.js';
import type { LifecycleRuntime } from './runtime.js';
import type { JsonObject, LifecycleActor } from './types.js';
import type { FireView, LifecycleDescriptionView } from './views.js';

export type { FireView, LifecycleDescriptionView } from './views.js';

/** What a request wants to do, for `authorize` to judge. */
export interface LifecycleRouteAccess {
  readonly lifecycle: string;
  readonly action: 'describe' | 'read' | 'fire' | 'operate';
  /** Absent for `describe`. */
  readonly id?: string;
  /** The transition a `fire` asks for. */
  readonly transition?: string;
}

export interface LifecycleRoutesOptions {
  /**
   * Who the request acts as, usually the signed-in user. Throw to refuse
   * it; the routes do not authenticate on their own.
   */
  actor(context: Context): LifecycleActor | Promise<LifecycleActor>;
  /**
   * Whether the actor may do this, beyond what the lifecycle's own guards
   * decide — reading a record, or an operator retrying a run. Defaults to
   * allowing `describe`, `read` and `fire`, and refusing `operate`.
   */
  authorize?(
    access: LifecycleRouteAccess,
    actor: LifecycleActor,
    context: Context,
  ): boolean | Promise<boolean>;
  /** The lifecycles to expose. Defaults to every registered one. */
  readonly lifecycles?: readonly string[];
}

/** The HTTP status each refusal answers with; a plugin's own routes map the same way. */
export const LIFECYCLE_ERROR_STATUS: Readonly<
  Record<LifecycleErrorCode, ContentfulStatusCode>
> = Object.freeze({
  INVALID_DEFINITION: 500,
  UNKNOWN_LIFECYCLE: 404,
  UNKNOWN_TRANSITION: 404,
  UNKNOWN_EFFECT: 404,
  RECORD_NOT_FOUND: 404,
  GUARD_REJECTED: 403,
  INVALID_STATE: 409,
  CONFLICT: 409,
  REQUEST_REUSED: 409,
  INVALID_INPUT: 400,
  INVALID_ROUTE: 400,
  INVALID_SET: 400,
});

class Refusal extends Error {
  public constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function body(context: Context): Promise<Record<string, unknown>> {
  const parsed: unknown = await context.req.json().catch(() => ({}));
  return isObject(parsed) ? parsed : {};
}

/**
 * The routes every page that shows a lifecycle record needs, so a plugin
 * mounts them instead of writing its own:
 *
 * - `GET /:lifecycle` — the description, parameters and diagram
 * - `GET /:lifecycle/:id` — the record, its state and version, what the actor
 *   may do and why not, and its history
 * - `POST /:lifecycle/:id/fire` — `{ transition, input?, requestId?, expectVersion? }`
 * - `POST /:lifecycle/:id/runs/:runId/retry` and `/cancel` — for operators
 *
 * A refusal answers `{ code, message, blockers, problems }` with a status
 * that follows its code. Records are created and listed by the plugin's own
 * routes, which know its forms and its queries.
 */
export function createLifecycleRoutes(
  runtime: LifecycleRuntime,
  options: LifecycleRoutesOptions,
): Hono {
  const exposed = new Set(options.lifecycles ?? runtime.names());
  const authorize = (
    access: LifecycleRouteAccess,
    actor: LifecycleActor,
    context: Context,
  ): boolean | Promise<boolean> =>
    options.authorize
      ? options.authorize(access, actor, context)
      : access.action !== 'operate';
  const router = new Hono();

  const allow = async (
    context: Context,
    access: LifecycleRouteAccess,
  ): Promise<LifecycleActor> => {
    if (!exposed.has(access.lifecycle))
      throw new Refusal(
        404,
        'UNKNOWN_LIFECYCLE',
        `No lifecycle "${access.lifecycle}".`,
      );
    const actor = await options.actor(context);
    if (!(await authorize(access, actor, context)))
      throw new Refusal(403, 'FORBIDDEN', 'Not allowed.');
    return actor;
  };

  router.onError((error, context) => {
    if (error instanceof LifecycleError)
      return context.json(
        {
          code: error.code,
          message: error.message,
          blockers: error.blockers,
          problems: error.problems,
        },
        LIFECYCLE_ERROR_STATUS[error.code],
      );
    if (error instanceof Refusal)
      return context.json(
        {
          code: error.code,
          message: error.message,
          blockers: [],
          problems: [],
        },
        error.status,
      );
    throw error;
  });

  router.get('/:lifecycle', async (context) => {
    const lifecycle = context.req.param('lifecycle');
    await allow(context, { lifecycle, action: 'describe' });
    const description = runtime.describe(lifecycle);
    return context.json({
      description,
      parameters: runtime.parameters(lifecycle) as Readonly<
        Record<string, unknown>
      >,
      diagram: toMermaid(description),
    } satisfies LifecycleDescriptionView);
  });

  router.get('/:lifecycle/:id', async (context) => {
    const { lifecycle, id } = context.req.param();
    const actor = await allow(context, { lifecycle, id, action: 'read' });
    return context.json(await runtime.view(lifecycle, id, actor));
  });

  router.post('/:lifecycle/:id/fire', async (context) => {
    const { lifecycle, id } = context.req.param();
    const values = await body(context);
    if (typeof values.transition !== 'string')
      throw new Refusal(400, 'INVALID_INPUT', 'Name the transition to fire.');
    const transition = values.transition;
    const actor = await allow(context, {
      lifecycle,
      id,
      action: 'fire',
      transition,
    });
    const expectVersion = values.expectVersion;
    const result = await runtime.fire(lifecycle, id, transition, {
      actor,
      input: isObject(values.input) ? (values.input as JsonObject) : {},
      ...(typeof values.requestId === 'string'
        ? { requestId: values.requestId }
        : {}),
      ...(typeof expectVersion === 'number' || expectVersion === null
        ? { expect: { version: expectVersion } }
        : {}),
    });
    return context.json({
      ...(await runtime.view(lifecycle, id, actor)),
      replayed: result.replayed === true,
    } satisfies FireView);
  });

  for (const action of ['retry', 'cancel'] as const)
    router.post(`/:lifecycle/:id/runs/:runId/${action}`, async (context) => {
      const { lifecycle, id, runId } = context.req.param();
      const actor = await allow(context, { lifecycle, id, action: 'operate' });
      // Only a run of this record: the URL names both.
      const runs = await runtime.listEffectRuns({ lifecycle, recordId: id });
      if (!runs.some((run) => run.id === runId))
        throw new Refusal(
          404,
          'RUN_NOT_FOUND',
          `No effect run "${runId}" on this record.`,
        );
      if (action === 'retry') await runtime.retryRun(runId);
      else await runtime.cancelRun(runId);
      return context.json(await runtime.view(lifecycle, id, actor));
    });

  return router;
}

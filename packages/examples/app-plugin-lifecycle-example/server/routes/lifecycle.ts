import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router';
import {
  lifecycleDescriptionView,
  type LifecycleRuntime,
} from '@nocobase/lifecycle';
import type { Hono } from 'hono';
import {
  LIFECYCLE_EXAMPLE_DOMAIN,
  outwardView,
  tags,
  toApiError,
} from './api.js';
import {
  ActAsQuery,
  DescriptionViewSchema,
  FireInput,
  FireViewSchema,
  RecordParams,
  RecordViewSchema,
  RetryRunInput,
  RunParams,
} from './schemas.js';

export interface LifecycleRoutesSpec {
  /** Where the plugin's routes start, such as `/lifecycleExample`. */
  readonly basePath: string;
  /** The lifecycle, which is also the path segment of its records. */
  readonly lifecycle: string;
  /** The record in an operationId and a summary, such as `Ticket`. */
  readonly noun: string;
}

/**
 * The routes a page needs for one lifecycle's records, at the paths
 * `@nocobase/lifecycle/react`'s client calls: the lifecycle's description,
 * one record with what the persona may do and its history, firing a
 * transition, and an operator's retry and cancel of an effect run. A guard
 * that refuses answers `GUARD_REJECTED` with the blockers in `metadata`:
 * `403` when one of them is about who asks, `400 FAILED_PRECONDITION` when
 * each is about the record, such as a ticket closed too long ago to reopen.
 */
export function lifecycleRoutes(
  router: Hono<AuthEnv>,
  runtime: LifecycleRuntime,
  spec: LifecycleRoutesSpec,
): void {
  const { lifecycle, noun } = spec;
  const path = `${spec.basePath}/${lifecycle}`;
  const lower = noun.charAt(0).toLowerCase() + noun.slice(1);
  const notFound = apiErrorResponse(404, `No such ${lower}.`);

  // A fixed segment, registered before `/:recordId`.
  router.get(
    `${path}/lifecycle`,
    describeRoute({
      tags,
      summary: `Describe the ${lower} lifecycle`,
      operationId: `lifecycleExampleDescribe${noun}Lifecycle`,
      description:
        'The states, transitions, effects and triggers, the administrator parameters, and a Mermaid diagram.',
      responses: {
        200: dataResponse(DescriptionViewSchema),
        401: apiErrorResponse(401),
        500: apiErrorResponse(500),
      },
    }),
    (context) =>
      context.json({ data: lifecycleDescriptionView(runtime, lifecycle) }),
  );

  router.get(
    `${path}/:recordId`,
    describeRoute({
      tags,
      summary: `Get a ${lower}`,
      operationId: `lifecycleExampleGet${noun}`,
      description:
        'The record, its state and version, which transitions the persona may fire and why not, and its history.',
      responses: {
        200: dataResponse(RecordViewSchema),
        401: apiErrorResponse(401),
        404: notFound,
        500: apiErrorResponse(500),
      },
    }),
    apiValidator('param', RecordParams),
    apiValidator('query', ActAsQuery),
    async (context) => {
      const { recordId } = context.req.valid('param');
      const { actAs } = context.req.valid('query');
      return context.json({
        data: outwardView(
          await runtime.view(lifecycle, recordId, { id: actAs }),
        ),
      });
    },
  );

  router.post(
    `${path}/:recordId/fire`,
    describeRoute({
      tags,
      summary: `Fire a transition on a ${lower}`,
      operationId: `lifecycleExampleFire${noun}Transition`,
      description:
        'Fires one transition as the persona and answers the record as it left it. Its guards decide who may and when: a refusal is `GUARD_REJECTED` with the blockers in `metadata.blockers`, each with its `kind`.',
      responses: {
        200: dataResponse(FireViewSchema),
        400: apiErrorResponse(
          400,
          'The state does not allow it (`INVALID_STATE`), every guard that refused waits for the record to change (`GUARD_REJECTED`, status `FAILED_PRECONDITION`), the input is invalid (`INVALID_INPUT`), the transition is unknown (`UNKNOWN_TRANSITION`) or the request id was spent on another (`REQUEST_REUSED`, `INVALID_REQUEST_ID`).',
        ),
        401: apiErrorResponse(401),
        403: apiErrorResponse(
          403,
          'A guard refused the persona (`GUARD_REJECTED`).',
        ),
        404: notFound,
        409: apiErrorResponse(
          409,
          'The record changed since the page read it (`CONFLICT`).',
        ),
        500: apiErrorResponse(500),
      },
    }),
    apiValidator('param', RecordParams),
    apiValidator('query', ActAsQuery),
    apiValidator('json', FireInput),
    async (context) => {
      const { recordId } = context.req.valid('param');
      const { actAs } = context.req.valid('query');
      const body = context.req.valid('json');
      const actor = { id: actAs };
      try {
        const result = await runtime.fire(
          lifecycle,
          recordId,
          body.transition,
          {
            actor,
            input: body.input,
            requestId: body.requestId,
            ...(body.expectVersion === undefined
              ? {}
              : { expect: { version: body.expectVersion } }),
          },
        );
        return context.json({
          data: {
            ...outwardView(await runtime.view(lifecycle, recordId, actor)),
            replayed: result.replayed === true,
          },
        });
      } catch (error) {
        // The transition's input sits under `input` in this body.
        throw toApiError(error, 'input');
      }
    },
  );

  // The example lets every persona operate runs from the record panel; an
  // application would check an operator permission here, before validating.
  const RunRouteParams = RecordParams.extend(RunParams.shape);
  /** The run the URL names, on the record it names; anything else is a 404. */
  const runOf = async (recordId: string, runId: string): Promise<void> => {
    const runs = await runtime.listEffectRuns({ lifecycle, recordId });
    if (!runs.some((run) => run.id === runId))
      throw new ApiError({
        status: 'NOT_FOUND',
        reason: 'EFFECT_RUN_NOT_FOUND',
        domain: LIFECYCLE_EXAMPLE_DOMAIN,
        message: `No effect run "${runId}" on this ${lower}.`,
      });
  };

  router.post(
    `${path}/:recordId/effectRuns/:runId/retry`,
    describeRoute({
      tags,
      summary: `Retry an effect run of a ${lower}`,
      operationId: `lifecycleExampleRetry${noun}EffectRun`,
      description:
        'Runs a failed, dead or cancelled run again. A run whose `onFailure` already moved the record on is refused with `RUN_SETTLED` unless `force` is set.',
      responses: {
        200: dataResponse(RecordViewSchema, 'The record afterwards.'),
        400: apiErrorResponse(
          400,
          'The run cannot be retried now (`INVALID_STATE`, `RUN_SETTLED`, `UNKNOWN_EFFECT`).',
        ),
        401: apiErrorResponse(401),
        404: apiErrorResponse(404, 'No such record, or no such run on it.'),
        500: apiErrorResponse(500),
      },
    }),
    apiValidator('param', RunRouteParams),
    apiValidator('query', ActAsQuery),
    apiValidator('json', RetryRunInput),
    async (context) => {
      const { recordId, runId } = context.req.valid('param');
      const { actAs } = context.req.valid('query');
      const { force, reason } = context.req.valid('json');
      const actor = { id: actAs };
      await runtime.view(lifecycle, recordId, actor);
      await runOf(recordId, runId);
      await runtime.retryRun(runId, {
        force,
        ...(reason === undefined ? {} : { reason }),
      });
      return context.json({
        data: outwardView(await runtime.view(lifecycle, recordId, actor)),
      });
    },
  );

  router.post(
    `${path}/:recordId/effectRuns/:runId/cancel`,
    describeRoute({
      tags,
      summary: `Cancel an effect run of a ${lower}`,
      operationId: `lifecycleExampleCancel${noun}EffectRun`,
      description:
        'Gives up on a queued or running run; nothing follows from it.',
      responses: {
        200: dataResponse(RecordViewSchema, 'The record afterwards.'),
        400: apiErrorResponse(
          400,
          'The run has already finished (`INVALID_STATE`).',
        ),
        401: apiErrorResponse(401),
        404: apiErrorResponse(404, 'No such record, or no such run on it.'),
        500: apiErrorResponse(500),
      },
    }),
    apiValidator('param', RunRouteParams),
    apiValidator('query', ActAsQuery),
    async (context) => {
      const { recordId, runId } = context.req.valid('param');
      const { actAs } = context.req.valid('query');
      const actor = { id: actAs };
      await runtime.view(lifecycle, recordId, actor);
      await runOf(recordId, runId);
      await runtime.cancelRun(runId);
      return context.json({
        data: outwardView(await runtime.view(lifecycle, recordId, actor)),
      });
    },
  );
}

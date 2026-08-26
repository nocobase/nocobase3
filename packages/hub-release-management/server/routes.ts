import { Hono } from 'hono';
import { ReleaseManagementError } from './errors.js';
import type { ReleaseAuthorizer } from './authorization.js';
import { isAppDeployToken, readBearerToken } from './app-management.js';
import type { ReleaseManagementService } from './service.js';
import type { ReleaseActor } from './types.js';

export interface ReleaseManagementRoutesOptions {
  service: ReleaseManagementService;
  authorize: ReleaseAuthorizer;
  authorizeAppDeployToken?: (
    token: string,
    appId: string,
  ) => Promise<ReleaseActor>;
}

export function createReleaseManagementRoutes(
  options: ReleaseManagementRoutesOptions,
): Hono {
  const routes = new Hono();

  routes.onError((error) => {
    const known = error instanceof ReleaseManagementError;
    if (!known || error.status >= 500) {
      console.error(error);
    }
    return Response.json(
      {
        error: error.message,
        code: known ? error.code : 'RELEASE_MANAGEMENT_ERROR',
      },
      { status: known ? error.status : 500 },
    );
  });

  routes.get('/overview', async (context) => {
    await options.authorize(context.req.raw);
    return context.json(await options.service.overview());
  });

  routes.get('/apps/:appId/deployments', async (context) => {
    await options.authorize(context.req.raw);
    return context.json({
      deployments: await options.service.deployments(
        context.req.param('appId'),
      ),
    });
  });

  routes.post('/apps/:appId/lifecycle', async (context) => {
    const request = context.req.raw;
    const actor = await options.authorize(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = await readBody(request);
    const action = input.action;
    if (action !== 'start' && action !== 'stop' && action !== 'restart') {
      throw new ReleaseManagementError(
        'action must be start, stop, or restart',
        { status: 400, code: 'INVALID_LIFECYCLE_ACTION' },
      );
    }
    if (!isSafeSegment(context.req.param('appId'))) {
      throw new ReleaseManagementError('appId must be a safe path segment', {
        status: 400,
        code: 'INVALID_APP_ID',
      });
    }
    const operation = await options.service.executeLifecycle({
      appId: context.req.param('appId'),
      action,
      idempotencyKey,
      actor,
    });
    return context.json({ operation });
  });

  routes.post('/apps/:appId/deployments', async (context) => {
    const request = context.req.raw;
    const appId = context.req.param('appId');
    const actor = await authorizeDeploymentRequest(options, request, appId);
    const idempotencyKey = requireIdempotencyKey(request);
    const releaseId = await readReleaseId(request, appId);
    const approval = await options.service.requestApproval({
      appId,
      releaseId,
      kind: 'deploy',
      idempotencyKey,
      actor,
    });
    return context.json({ approval }, 202);
  });

  routes.post('/apps/:appId/rollbacks', async (context) => {
    const request = context.req.raw;
    const actor = await options.authorize(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const releaseId = await readReleaseId(request, context.req.param('appId'));
    const approval = await options.service.requestApproval({
      appId: context.req.param('appId'),
      releaseId,
      kind: 'rollback',
      idempotencyKey,
      actor,
    });
    return context.json({ approval }, 202);
  });

  routes.post('/approvals/:approvalId/decision', async (context) => {
    const request = context.req.raw;
    const actor = await options.authorize(request);
    const input = await readBody(request);
    const decision = input.decision;
    if (decision !== 'approve' && decision !== 'reject') {
      throw new ReleaseManagementError(
        'decision must be either approve or reject',
        { status: 400, code: 'INVALID_APPROVAL_DECISION' },
      );
    }
    const comment = input.comment;
    if (comment !== undefined && typeof comment !== 'string') {
      throw new ReleaseManagementError('comment must be a string', {
        status: 400,
        code: 'INVALID_APPROVAL_COMMENT',
      });
    }
    const approval = await options.service.decideApproval({
      approvalId: context.req.param('approvalId'),
      decision,
      comment,
      actor,
    });
    return context.json(
      { approval },
      approval.status === 'executing' ? 202 : 200,
    );
  });

  return routes;
}

async function authorizeDeploymentRequest(
  options: ReleaseManagementRoutesOptions,
  request: Request,
  appId: string,
): Promise<ReleaseActor> {
  const bearer = readBearerToken(request);
  if (bearer && isAppDeployToken(bearer) && options.authorizeAppDeployToken) {
    return options.authorizeAppDeployToken(bearer, appId);
  }
  return options.authorize(request);
}

function requireIdempotencyKey(request: Request): string {
  const idempotencyKey = request.headers.get('idempotency-key')?.trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new ReleaseManagementError(
      'A non-empty Idempotency-Key header of at most 128 characters is required',
      {
        status: 400,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      },
    );
  }
  return idempotencyKey;
}

async function readReleaseId(request: Request, appId: string): Promise<string> {
  const input = await readBody(request);
  const releaseId =
    typeof input.releaseId === 'string' ? input.releaseId.trim() : '';
  if (!isSafeSegment(appId) || !isSafeSegment(releaseId)) {
    throw new ReleaseManagementError(
      'appId and releaseId must be safe path segments',
      {
        status: 400,
        code: 'INVALID_RELEASE_TARGET',
      },
    );
  }
  return releaseId;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch (error) {
    throw new ReleaseManagementError('Request body must be valid JSON', {
      status: 400,
      code: 'INVALID_JSON_BODY',
      cause: error,
    });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReleaseManagementError('Request body must be a JSON object', {
      status: 400,
      code: 'INVALID_JSON_BODY',
    });
  }
  return value as Record<string, unknown>;
}

function isSafeSegment(value: string): boolean {
  return (
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) &&
    value !== '.' &&
    value !== '..'
  );
}

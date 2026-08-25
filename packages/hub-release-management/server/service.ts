import { randomUUID } from 'node:crypto';
import { AppHostRequestError } from './errors.js';
import type { AppHostClient } from './app-host-client.js';
import type { DeploymentStore } from './deployment-store.js';
import {
  InMemoryAppLifecycleOperationStore,
  type AppLifecycleOperationStore,
} from './lifecycle-operation-store.js';
import { ReleaseManagementError } from './errors.js';
import type {
  ReleaseNotificationSink,
  ReleaseWorkflowStore,
} from './workflow-store.js';
import type {
  AppReleaseOverview,
  AppLifecycleAction,
  AppLifecycleOperationRecord,
  DeploymentKind,
  DeploymentRecord,
  AppRuntimeResourceSummary,
  ReleaseApprovalRecord,
  ReleaseActor,
  ReleaseOverview,
} from './types.js';

export interface ExecuteDeploymentInput {
  appId: string;
  releaseId: string;
  kind: DeploymentKind;
  idempotencyKey: string;
  actor: ReleaseActor;
}

export interface ExecuteLifecycleInput {
  appId: string;
  action: AppLifecycleAction;
  idempotencyKey: string;
  actor: ReleaseActor;
}

export type RequestReleaseApprovalInput = ExecuteDeploymentInput;

export interface DecideReleaseApprovalInput {
  approvalId: string;
  decision: 'approve' | 'reject';
  comment?: string;
  actor: ReleaseActor;
}

export interface ReleaseApprovalWorkflowOptions {
  store: ReleaseWorkflowStore;
  notifications: ReleaseNotificationSink;
}

export class ReleaseManagementService {
  private readonly operations = new Map<string, Promise<DeploymentRecord>>();
  private readonly approvalOperations = new Map<
    string,
    {
      decision: DecideReleaseApprovalInput['decision'];
      promise: Promise<ReleaseApprovalRecord>;
    }
  >();
  private readonly lifecycleOperations = new Map<
    string,
    Promise<AppLifecycleOperationRecord>
  >();

  constructor(
    private readonly appHost: AppHostClient,
    private readonly store: DeploymentStore,
    private readonly workflow:
      ReleaseApprovalWorkflowOptions | undefined = undefined,
    private readonly lifecycleStore: AppLifecycleOperationStore = new InMemoryAppLifecycleOperationStore(),
  ) {}

  async overview(): Promise<ReleaseOverview> {
    const [host, deployments, lifecycleOperations, approvals, notifications] =
      await Promise.all([
        this.appHost.overview(),
        this.store.list(),
        this.lifecycleStore.list(),
        this.workflow?.store.listApprovals() ?? Promise.resolve(undefined),
        this.workflow?.store.listNotifications() ?? Promise.resolve(undefined),
      ]);
    const activeById = new Map(host.active.map((app) => [app.id, app]));
    const definitionsById = new Map(
      host.definitions.map((definition) => [definition.id, definition]),
    );
    const deployedReleaseById = new Map(
      (host.activeReleases ?? []).map((release) => [release.appId, release]),
    );
    const lifecycleById = new Map(
      (host.lifecycle ?? []).map((status) => [status.appId, status]),
    );
    const appIds = new Set(host.releases.map((release) => release.appId));
    const apps: AppReleaseOverview[] = [...appIds]
      .sort((a, b) => a.localeCompare(b))
      .map((id) => {
        const active = activeById.get(id);
        const definition = definitionsById.get(id);
        const deployedRelease = deployedReleaseById.get(id);
        const activeReleaseId =
          active?.releaseId ?? deployedRelease?.releaseId ?? null;
        const activeRelease = host.releases.find(
          (release) => release.appId === id && release.id === activeReleaseId,
        );
        const lifecycle = lifecycleById.get(id);
        const desiredState = lifecycle?.desiredState ?? 'running';
        const runtimeState =
          lifecycle?.runtimeState ?? (active ? 'active' : 'stopped');
        const basePath = active?.basePath ?? definition?.basePath ?? null;
        return {
          id,
          name:
            active?.displayName ??
            definition?.displayName ??
            active?.appName ??
            definition?.appName ??
            id,
          basePath,
          accessUrl: basePath ? safeGatewayAccessPath(basePath, id) : null,
          activeReleaseId,
          activeVersion: active?.codeVersion ?? activeRelease?.version ?? null,
          state:
            desiredState === 'stopped'
              ? runtimeState === 'failed'
                ? 'failed'
                : 'stopped'
              : (active?.state ?? (deployedRelease ? 'idle' : 'not-deployed')),
          desiredState,
          runtimeState,
          lifecycleError: lifecycle?.lastError ?? null,
          releases: host.releases.filter((release) => release.appId === id),
          resources: (active?.resources ?? []).map(sanitizeRuntimeResource),
        };
      });

    return {
      apps,
      deployments,
      lifecycleOperations,
      ...(approvals ? { approvals } : {}),
      ...(notifications ? { notifications } : {}),
    };
  }

  executeLifecycle(
    input: ExecuteLifecycleInput,
  ): Promise<AppLifecycleOperationRecord> {
    const previous = this.lifecycleOperations.get(input.appId);
    const operation = (previous ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => this.executeLifecycleUnlocked(input));
    this.lifecycleOperations.set(input.appId, operation);
    return operation.finally(() => {
      if (this.lifecycleOperations.get(input.appId) === operation) {
        this.lifecycleOperations.delete(input.appId);
      }
    });
  }

  async deployments(appId?: string): Promise<DeploymentRecord[]> {
    return this.store.list(appId);
  }

  async requestApproval(
    input: RequestReleaseApprovalInput,
  ): Promise<ReleaseApprovalRecord> {
    const workflow = this.requireWorkflow();
    const existing = await workflow.store.findApprovalByIdempotencyKey(
      input.appId,
      input.kind,
      input.idempotencyKey,
    );
    if (existing && existing.releaseId !== input.releaseId) {
      throw new ReleaseManagementError(
        'Idempotency key was already used for a different release approval',
        { status: 409, code: 'APPROVAL_IDEMPOTENCY_CONFLICT' },
      );
    }
    if (existing) {
      await this.notifyApprovalRequested(existing);
      return existing;
    }

    await this.assertReleaseTarget(input.appId, input.releaseId);
    const approval: ReleaseApprovalRecord = {
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      appId: input.appId,
      releaseId: input.releaseId,
      kind: input.kind,
      status: 'pending',
      requestedBy: input.actor,
      requestedAt: new Date().toISOString(),
      decidedBy: null,
      decidedAt: null,
      decisionComment: null,
      deploymentId: null,
      error: null,
    };
    await workflow.store.saveApproval(approval);
    await this.notifyApprovalRequested(approval);
    return approval;
  }

  decideApproval(
    input: DecideReleaseApprovalInput,
  ): Promise<ReleaseApprovalRecord> {
    const inFlight = this.approvalOperations.get(input.approvalId);
    if (inFlight) {
      if (inFlight.decision !== input.decision) {
        return Promise.reject(
          new ReleaseManagementError(
            'A different decision is already executing for this approval',
            { status: 409, code: 'APPROVAL_DECISION_CONFLICT' },
          ),
        );
      }
      return inFlight.promise;
    }

    const operation = this.decideApprovalUnlocked(input);
    this.approvalOperations.set(input.approvalId, {
      decision: input.decision,
      promise: operation,
    });
    return operation.finally(() => {
      if (
        this.approvalOperations.get(input.approvalId)?.promise === operation
      ) {
        this.approvalOperations.delete(input.approvalId);
      }
    });
  }

  execute(input: ExecuteDeploymentInput): Promise<DeploymentRecord> {
    const operationKey = `${input.appId}:${input.kind}:${input.idempotencyKey}`;
    const inFlight = this.operations.get(operationKey);
    if (inFlight) {
      return inFlight;
    }

    const operation = this.executeUnlocked(input).finally(() => {
      if (this.operations.get(operationKey) === operation) {
        this.operations.delete(operationKey);
      }
    });
    this.operations.set(operationKey, operation);
    return operation;
  }

  private async decideApprovalUnlocked(
    input: DecideReleaseApprovalInput,
  ): Promise<ReleaseApprovalRecord> {
    const workflow = this.requireWorkflow();
    const current = await this.requireApproval(input.approvalId);
    const decidedAs = current.status === 'rejected' ? 'reject' : 'approve';
    if (['rejected', 'succeeded', 'failed'].includes(current.status)) {
      if (decidedAs !== input.decision) {
        throw new ReleaseManagementError(
          'Release approval has already been decided differently',
          { status: 409, code: 'APPROVAL_ALREADY_DECIDED' },
        );
      }
      await this.notifyTerminalApproval(current);
      return current;
    }

    if (current.status === 'executing' && input.decision === 'reject') {
      throw new ReleaseManagementError(
        'Release approval is already executing and cannot be rejected',
        { status: 409, code: 'APPROVAL_ALREADY_EXECUTING' },
      );
    }

    const comment = normalizeApprovalComment(input.comment);
    if (input.decision === 'reject') {
      const rejected: ReleaseApprovalRecord = {
        ...current,
        status: 'rejected',
        decidedBy: input.actor,
        decidedAt: new Date().toISOString(),
        decisionComment: comment,
      };
      await workflow.store.saveApproval(rejected);
      await workflow.notifications.notify({
        approvalId: rejected.id,
        appId: rejected.appId,
        releaseId: rejected.releaseId,
        event: 'approval_rejected',
        recipient: rejected.requestedBy,
        title: '发布申请已拒绝',
        body: comment || `${rejected.appId} / ${rejected.releaseId} 未获批准。`,
      });
      return rejected;
    }

    const executing: ReleaseApprovalRecord = {
      ...current,
      status: 'executing',
      decidedBy: current.decidedBy ?? input.actor,
      decidedAt: current.decidedAt ?? new Date().toISOString(),
      decisionComment: current.decisionComment ?? comment,
      error: null,
    };
    await workflow.store.saveApproval(executing);
    await workflow.notifications.notify({
      approvalId: executing.id,
      appId: executing.appId,
      releaseId: executing.releaseId,
      event: 'approval_approved',
      recipient: executing.requestedBy,
      title:
        executing.kind === 'rollback' ? '回滚申请已批准' : '发布申请已批准',
      body: `${executing.appId} / ${executing.releaseId} 开始执行健康校验与切流。`,
    });

    const deployment = await this.execute({
      appId: executing.appId,
      releaseId: executing.releaseId,
      kind: executing.kind,
      idempotencyKey: `approval-${executing.id}`,
      actor: executing.decidedBy ?? input.actor,
    });
    const completed: ReleaseApprovalRecord = {
      ...executing,
      status: deployment.status === 'failed' ? 'failed' : 'succeeded',
      deploymentId: deployment.id,
      error: deployment.error,
    };
    await workflow.store.saveApproval(completed);
    await workflow.notifications.notify({
      approvalId: completed.id,
      appId: completed.appId,
      releaseId: completed.releaseId,
      event:
        deployment.status === 'failed'
          ? 'deployment_failed'
          : 'deployment_succeeded',
      recipient: completed.requestedBy,
      title:
        deployment.status === 'failed'
          ? '发布执行失败，在线版本未切换'
          : completed.kind === 'rollback'
            ? '回滚完成'
            : '发布完成',
      body:
        deployment.status === 'failed'
          ? `${deployment.error?.code ?? 'RELEASE_FAILED'}：${deployment.error?.message ?? '执行失败'}`
          : `${completed.appId} 当前在线版本为 ${deployment.activeReleaseId ?? completed.releaseId}。`,
    });
    return completed;
  }

  private notifyApprovalRequested(
    approval: ReleaseApprovalRecord,
  ): Promise<unknown> {
    return this.requireWorkflow().notifications.notify({
      approvalId: approval.id,
      appId: approval.appId,
      releaseId: approval.releaseId,
      event: 'approval_requested',
      recipient: approval.requestedBy,
      title: approval.kind === 'rollback' ? '回滚申请待审批' : '发布申请待审批',
      body: `${approval.appId} / ${approval.releaseId} 已进入发布审批流程。`,
    });
  }

  private notifyTerminalApproval(
    approval: ReleaseApprovalRecord,
  ): Promise<unknown> {
    const event =
      approval.status === 'rejected'
        ? 'approval_rejected'
        : approval.status === 'failed'
          ? 'deployment_failed'
          : 'deployment_succeeded';
    return this.requireWorkflow().notifications.notify({
      approvalId: approval.id,
      appId: approval.appId,
      releaseId: approval.releaseId,
      event,
      recipient: approval.requestedBy,
      title:
        approval.status === 'rejected'
          ? '发布申请已拒绝'
          : approval.status === 'failed'
            ? '发布执行失败，在线版本未切换'
            : approval.kind === 'rollback'
              ? '回滚完成'
              : '发布完成',
      body:
        approval.status === 'rejected'
          ? approval.decisionComment ||
            `${approval.appId} / ${approval.releaseId} 未获批准。`
          : approval.status === 'failed'
            ? `${approval.error?.code ?? 'RELEASE_FAILED'}：${approval.error?.message ?? '执行失败'}`
            : `${approval.appId} / ${approval.releaseId} 已完成切换。`,
    });
  }

  private async requireApproval(id: string): Promise<ReleaseApprovalRecord> {
    const approval = await this.requireWorkflow().store.findApprovalById(id);
    if (!approval) {
      throw new ReleaseManagementError('Release approval was not found', {
        status: 404,
        code: 'APPROVAL_NOT_FOUND',
      });
    }
    return approval;
  }

  private requireWorkflow(): ReleaseApprovalWorkflowOptions {
    if (!this.workflow) {
      throw new ReleaseManagementError(
        'Release approval workflow is not configured',
        { status: 503, code: 'APPROVAL_WORKFLOW_NOT_CONFIGURED' },
      );
    }
    return this.workflow;
  }

  private async assertReleaseTarget(
    appId: string,
    releaseId: string,
  ): Promise<void> {
    const host = await this.appHost.overview();
    const release = host.releases.find(
      (candidate) => candidate.appId === appId && candidate.id === releaseId,
    );
    if (!release) {
      throw new ReleaseManagementError('Release target was not found', {
        status: 404,
        code: 'RELEASE_TARGET_NOT_FOUND',
      });
    }
  }

  private async executeUnlocked(
    input: ExecuteDeploymentInput,
  ): Promise<DeploymentRecord> {
    const existing = await this.store.findByIdempotencyKey(
      input.appId,
      input.kind,
      input.idempotencyKey,
    );
    if (existing && existing.releaseId !== input.releaseId) {
      throw new AppHostRequestError(
        'Idempotency key was already used for a different release',
        {
          status: 409,
          code: 'IDEMPOTENCY_KEY_CONFLICT',
        },
      );
    }
    if (existing && existing.status !== 'pending') {
      return existing;
    }

    const requestedAt = existing?.requestedAt ?? new Date().toISOString();
    const pending: DeploymentRecord =
      existing ??
      ({
        id: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        appId: input.appId,
        releaseId: input.releaseId,
        kind: input.kind,
        status: 'pending',
        changed: null,
        previousReleaseId: null,
        activeReleaseId: null,
        activeVersion: null,
        actor: input.actor,
        requestedAt,
        completedAt: null,
        error: null,
      } satisfies DeploymentRecord);

    await this.store.save(pending);

    try {
      const result = await this.appHost.deploy(
        input.appId,
        input.releaseId,
        input.kind,
      );
      const completed: DeploymentRecord = {
        ...pending,
        status: result.changed ? 'succeeded' : 'unchanged',
        changed: result.changed,
        previousReleaseId: result.previousReleaseId,
        activeReleaseId: result.activeReleaseId,
        activeVersion: result.activeVersion,
        completedAt: new Date().toISOString(),
        error: null,
      };
      await this.store.save(completed);
      return completed;
    } catch (error) {
      const appHostError =
        error instanceof AppHostRequestError
          ? error
          : new AppHostRequestError(
              error instanceof Error ? error.message : String(error),
              { cause: error },
            );
      const active = await this.readActiveApp(input.appId);
      const failed: DeploymentRecord = {
        ...pending,
        status: 'failed',
        changed: false,
        activeReleaseId: active?.activeReleaseId ?? null,
        activeVersion: active?.activeVersion ?? null,
        completedAt: new Date().toISOString(),
        error: {
          code: appHostError.code,
          message: appHostError.message,
        },
      };
      await this.store.save(failed);
      return failed;
    }
  }

  private async executeLifecycleUnlocked(
    input: ExecuteLifecycleInput,
  ): Promise<AppLifecycleOperationRecord> {
    const existing = await this.lifecycleStore.findByIdempotencyKey(
      input.appId,
      input.idempotencyKey,
    );
    if (existing && existing.action !== input.action) {
      throw new ReleaseManagementError(
        'Idempotency key was already used for a different lifecycle action',
        { status: 409, code: 'LIFECYCLE_IDEMPOTENCY_CONFLICT' },
      );
    }
    if (existing && existing.status !== 'pending') {
      return existing;
    }

    const pending: AppLifecycleOperationRecord = existing ?? {
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      appId: input.appId,
      action: input.action,
      status: 'pending',
      changed: null,
      desiredState: null,
      runtimeState: null,
      actor: input.actor,
      requestedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    };
    await this.lifecycleStore.save(pending);

    try {
      const result = await this.appHost.controlLifecycle(
        input.appId,
        input.action,
      );
      const completed: AppLifecycleOperationRecord = {
        ...pending,
        status: result.changed ? 'succeeded' : 'unchanged',
        changed: result.changed,
        desiredState: result.desiredState,
        runtimeState: result.runtimeState,
        completedAt: new Date().toISOString(),
        error: null,
      };
      await this.lifecycleStore.save(completed);
      return completed;
    } catch (error) {
      const known =
        error instanceof AppHostRequestError
          ? error
          : new AppHostRequestError(
              error instanceof Error ? error.message : String(error),
              { cause: error },
            );
      const failed: AppLifecycleOperationRecord = {
        ...pending,
        status: 'failed',
        changed: false,
        completedAt: new Date().toISOString(),
        error: { code: known.code, message: known.message },
      };
      await this.lifecycleStore.save(failed);
      return failed;
    }
  }

  private async readActiveApp(
    appId: string,
  ): Promise<AppReleaseOverview | null> {
    try {
      const overview = await this.overview();
      return overview.apps.find((app) => app.id === appId) ?? null;
    } catch {
      return null;
    }
  }
}

function sanitizeRuntimeResource(
  resource: AppRuntimeResourceSummary,
): AppRuntimeResourceSummary {
  const details =
    resource.kind === 'database'
      ? pickStringDetails(resource.details, [
          'connectionName',
          'dialect',
          'driver',
        ])
      : undefined;
  return {
    id: resource.id,
    kind: resource.kind,
    name: resource.name,
    status: resource.status,
    provider: resource.provider,
    updatedAt: resource.updatedAt,
    ...(details ? { details } : {}),
    error:
      resource.status === 'error'
        ? {
            code: resource.error?.code ?? 'RUNTIME_RESOURCE_ERROR',
            message:
              resource.kind === 'database'
                ? '数据库连接检查失败，请查看 Runtime 日志。'
                : 'Runtime 资源状态异常。',
          }
        : null,
  };
}

function pickStringDetails(
  details: AppRuntimeResourceSummary['details'],
  keys: readonly string[],
): Record<string, string> | undefined {
  if (!details) return undefined;
  const entries = keys.flatMap((key) => {
    const value = details[key];
    return typeof value === 'string' ? [[key, value] as const] : [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function safeGatewayAccessPath(
  value: string | undefined,
  appId: string,
): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,127})\/?$/);
  return match?.[1] === appId ? `/${appId}/` : null;
}

function normalizeApprovalComment(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 500) {
    throw new ReleaseManagementError(
      'Approval comment must be at most 500 characters',
      { status: 400, code: 'APPROVAL_COMMENT_TOO_LONG' },
    );
  }
  return normalized;
}

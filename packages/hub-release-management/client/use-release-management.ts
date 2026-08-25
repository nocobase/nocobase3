import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  decideReleaseApproval,
  executeAppLifecycle,
  executeRelease,
  fetchReleaseOverview,
  ReleaseApiError,
} from './api.js';
import { isReadinessBlocked } from './logic.js';
import type {
  DeploymentKind,
  AppLifecycleAction,
  ReleaseApprovalRecord,
  ReleaseOverview,
} from './types.js';

const emptyOverview: ReleaseOverview = {
  apps: [],
  deployments: [],
  lifecycleOperations: [],
};

export interface UseReleaseManagementOptions {
  appId?: string;
}

export interface ReleaseManagementAction {
  appId: string;
  releaseId: string;
  kind: DeploymentKind;
}

export interface UseReleaseManagementResult {
  overview: ReleaseOverview;
  scopedOverview: ReleaseOverview;
  busy: boolean;
  error: string | null;
  errorCode: string | null;
  errorStatus: number | null;
  refresh: (signal?: AbortSignal) => Promise<void>;
  run: (input: ReleaseManagementAction) => Promise<void>;
  runLifecycle: (input: {
    appId: string;
    action: AppLifecycleAction;
  }) => Promise<void>;
  decide: (input: {
    approvalId: string;
    decision: 'approve' | 'reject';
    comment?: string;
  }) => Promise<void>;
}

export function useReleaseManagement(
  options: UseReleaseManagementOptions = {},
): UseReleaseManagementResult {
  const [overview, setOverview] = useState<ReleaseOverview>(emptyOverview);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    try {
      setOverview(await fetchReleaseOverview(signal));
      setError(null);
      setErrorCode(null);
      setErrorStatus(null);
    } catch (requestError) {
      if (signal?.aborted) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : '无法读取发布控制面',
      );
      setErrorCode(
        requestError instanceof ReleaseApiError ? requestError.code : null,
      );
      setErrorStatus(
        requestError instanceof ReleaseApiError ? requestError.status : null,
      );
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const run = useCallback(
    async (input: ReleaseManagementAction): Promise<void> => {
      setBusy(true);
      try {
        const deployment = await executeRelease({
          ...input,
          idempotencyKey: crypto.randomUUID(),
        });
        if ('requestedBy' in deployment) {
          toast.success(
            deployment.kind === 'rollback'
              ? '回滚申请已提交'
              : '发布申请已提交',
            {
              description: '审批通过后才会执行健康校验与切流',
            },
          );
        } else if (deployment.status === 'failed') {
          toast.error(
            isReadinessBlocked(deployment)
              ? '候选版本被健康门禁拦截'
              : '发布执行失败',
            {
              description: `在线版本仍为 ${deployment.activeReleaseId ?? '原版本'}`,
            },
          );
        } else if (deployment.status === 'unchanged') {
          toast.info('目标版本已在线，无需重复切换');
        } else {
          toast.success(input.kind === 'rollback' ? '回滚成功' : '发布成功', {
            description: `当前在线 ${deployment.activeReleaseId}`,
          });
        }
        await refresh();
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : '发布操作失败';
        setError(message);
        setErrorCode(
          requestError instanceof ReleaseApiError ? requestError.code : null,
        );
        setErrorStatus(
          requestError instanceof ReleaseApiError ? requestError.status : null,
        );
        toast.error('发布操作失败', { description: message });
        setBusy(false);
      }
    },
    [refresh],
  );

  const decide = useCallback(
    async (input: {
      approvalId: string;
      decision: 'approve' | 'reject';
      comment?: string;
    }): Promise<void> => {
      setBusy(true);
      try {
        const approval: ReleaseApprovalRecord =
          await decideReleaseApproval(input);
        if (approval.status === 'rejected') {
          toast.info('发布申请已拒绝');
        } else if (approval.status === 'failed') {
          toast.error('发布执行失败', {
            description: approval.error?.message ?? '在线版本未切换',
          });
        } else {
          toast.success('审批通过，发布已完成');
        }
        await refresh();
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : '审批操作失败';
        setError(message);
        setErrorCode(
          requestError instanceof ReleaseApiError ? requestError.code : null,
        );
        setErrorStatus(
          requestError instanceof ReleaseApiError ? requestError.status : null,
        );
        toast.error('审批操作失败', { description: message });
        setBusy(false);
      }
    },
    [refresh],
  );

  const runLifecycle = useCallback(
    async (input: {
      appId: string;
      action: AppLifecycleAction;
    }): Promise<void> => {
      setBusy(true);
      try {
        const operation = await executeAppLifecycle({
          ...input,
          idempotencyKey: crypto.randomUUID(),
        });
        if (operation.status === 'failed') {
          toast.error('App 状态切换失败', {
            description: operation.error?.message ?? '请稍后重试',
          });
        } else if (operation.status === 'unchanged') {
          toast.info('App 已经处于目标状态');
        } else {
          toast.success(
            input.action === 'start'
              ? 'App 已启动'
              : input.action === 'stop'
                ? 'App 已停止'
                : 'App 已重新启动',
          );
        }
        await refresh();
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : 'App 状态切换失败';
        setError(message);
        setErrorCode(
          requestError instanceof ReleaseApiError ? requestError.code : null,
        );
        setErrorStatus(
          requestError instanceof ReleaseApiError ? requestError.status : null,
        );
        toast.error('App 状态切换失败', { description: message });
        setBusy(false);
      }
    },
    [refresh],
  );

  const scopedOverview = useMemo<ReleaseOverview>(() => {
    if (!options.appId) return overview;
    return {
      apps: overview.apps.filter((app) => app.id === options.appId),
      deployments: overview.deployments.filter(
        (deployment) => deployment.appId === options.appId,
      ),
      lifecycleOperations: overview.lifecycleOperations.filter(
        (operation) => operation.appId === options.appId,
      ),
      approvals: overview.approvals?.filter(
        (approval) => approval.appId === options.appId,
      ),
      notifications: overview.notifications?.filter(
        (notification) => notification.appId === options.appId,
      ),
    };
  }, [options.appId, overview]);

  return {
    overview,
    scopedOverview,
    busy,
    error,
    errorCode,
    errorStatus,
    refresh,
    run,
    runLifecycle,
    decide,
  };
}

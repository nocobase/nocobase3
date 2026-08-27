import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  createManagedApp,
  decideReleaseApproval,
  executeAppLifecycle,
  executeRelease,
  fetchReleaseOverview,
  ReleaseApiError,
  unregisterManagedApp,
} from './api.js';
import { isReadinessBlocked } from './logic.js';
import type {
  DeploymentKind,
  AppLifecycleAction,
  ReleaseApprovalRecord,
  ReleaseOverview,
  ManagedAppRecord,
  ManagedAppType,
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
  createApp: (input: {
    id: string;
    name?: string;
    type?: ManagedAppType;
  }) => Promise<ManagedAppRecord>;
  unregisterApp: (appId: string) => Promise<boolean>;
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
          : '无法读取部署控制面',
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
              : '部署申请已提交',
            {
              description: '审批通过后才会执行健康校验与切流',
            },
          );
        } else if (deployment.status === 'failed') {
          toast.error(
            isReadinessBlocked(deployment)
              ? '候选版本被健康门禁拦截'
              : '部署执行失败',
            {
              description: `在线版本仍为 ${deployment.activeReleaseId ?? '原版本'}`,
            },
          );
        } else if (deployment.status === 'unchanged') {
          toast.info('目标版本已在线，无需重复切换');
        } else {
          toast.success(input.kind === 'rollback' ? '回滚成功' : '部署成功', {
            description: `当前在线 ${deployment.activeReleaseId}`,
          });
        }
        await refresh();
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : '部署操作失败';
        setError(message);
        setErrorCode(
          requestError instanceof ReleaseApiError ? requestError.code : null,
        );
        setErrorStatus(
          requestError instanceof ReleaseApiError ? requestError.status : null,
        );
        toast.error('部署操作失败', { description: message });
        setBusy(false);
      }
    },
    [refresh],
  );

  const createApp = useCallback(
    async (input: {
      id: string;
      name?: string;
      type?: ManagedAppType;
    }): Promise<ManagedAppRecord> => {
      setBusy(true);
      try {
        const result = await createManagedApp(input);
        toast.success(result.created ? '应用已创建' : '应用已存在', {
          description: '接下来可在本地创建源码并部署构建产物。',
        });
        await refresh();
        return result.app;
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : '创建应用失败';
        setError(message);
        setErrorCode(
          requestError instanceof ReleaseApiError ? requestError.code : null,
        );
        setErrorStatus(
          requestError instanceof ReleaseApiError ? requestError.status : null,
        );
        toast.error('创建应用失败', { description: message });
        setBusy(false);
        throw requestError;
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

  const unregisterApp = useCallback(
    async (appId: string): Promise<boolean> => {
      setBusy(true);
      try {
        const result = await unregisterManagedApp(appId);
        if (result.removed) {
          toast.success('应用已取消登记', {
            description: '本地源码和数据不会被删除。',
          });
        } else {
          toast.info('应用已经不在登记清单中');
        }
        await refresh();
        return true;
      } catch (requestError) {
        const message =
          requestError instanceof ReleaseApiError &&
          requestError.code === 'APP_UNREGISTER_NOT_EMPTY'
            ? '已有构建产物或运行记录的 App 不能取消登记。'
            : requestError instanceof Error
              ? requestError.message
              : '取消登记失败';
        setError(message);
        setErrorCode(
          requestError instanceof ReleaseApiError ? requestError.code : null,
        );
        setErrorStatus(
          requestError instanceof ReleaseApiError ? requestError.status : null,
        );
        toast.error('取消登记失败', { description: message });
        setBusy(false);
        return false;
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
      managedApps: overview.managedApps?.filter(
        (app) => app.id === options.appId,
      ),
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
    createApp,
    unregisterApp,
    run,
    runLifecycle,
    decide,
  };
}

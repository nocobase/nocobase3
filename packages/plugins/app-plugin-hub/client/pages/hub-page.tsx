import { LoaderCircle } from 'lucide-react';
import {
  ApiClientError,
  apiClientToken,
  useService,
} from '@nocobase/app-client';
import { authorizationClientToken } from '@nocobase/app-plugin-authorization/client';
import { Button } from '../components/ui/button.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import type {
  AppSummary,
  AppOverview,
  ReleaseRecord,
  DeploymentRecord,
  DetailTab,
  ViewMode,
  ConfigMode,
  ApiResponse,
  ConfigResponse,
  ConfigTemplateResponse,
} from './hub/types.js';
import { ErrorBanner, AppDialog } from './hub/shared.js';
import { Catalog, CreateDialog } from './hub/catalog.js';
import { Detail, RemoveApplicationDialog } from './hub/detail.js';
import { DeploymentDialog } from './hub/configuration.js';
import { UploadReleaseDialog } from './hub/releases.js';
import { uploadArtifact, readError } from './hub/utils.js';
import {
  emptyHubCapabilities,
  loadHubCapabilities,
  resolveHubDetailTab,
  type HubCapabilities,
} from '../permissions.js';

export default function HubPage(): ReactElement {
  const client = useService(apiClientToken);
  const authorization = useService(authorizationClientToken);
  const [capabilities, setCapabilities] =
    useState<HubCapabilities>(emptyHubCapabilities);
  const [apps, setApps] = useState<readonly AppSummary[]>([]);
  const [detail, setDetail] = useState<AppOverview>();
  const [releases, setReleases] = useState<readonly ReleaseRecord[]>([]);
  const [deployments, setDeployments] = useState<readonly DeploymentRecord[]>(
    [],
  );
  const [panelKey, setPanelKey] = useState('');
  const [deploymentPage, setDeploymentPage] = useState(1);
  const [deploymentPagination, setDeploymentPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [deploymentsLoading, setDeploymentsLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [tab, setTab] = useState<DetailTab>('deployments');
  const [view, setView] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [configMode, setConfigMode] = useState<ConfigMode>('file');
  const [configContent, setConfigContent] = useState('');
  const [deploymentMode, setDeploymentMode] = useState<ConfigMode>('file');
  const [deploymentContent, setDeploymentContent] = useState('');
  const [deploymentBaseline, setDeploymentBaseline] = useState('');
  const [deploymentBaselineMode, setDeploymentBaselineMode] =
    useState<ConfigMode>('file');
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>();
  const [deploymentReleaseId, setDeploymentReleaseId] = useState<string>();
  const [rollbackDeploymentId, setRollbackDeploymentId] = useState<string>();
  const [artifact, setArtifact] = useState<File>();
  const [deployOpen, setDeployOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<
    'start' | 'stop' | 'restart'
  >();
  const [createOpen, setCreateOpen] = useState(false);
  const [newAppId, setNewAppId] = useState('');
  const [newAppName, setNewAppName] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshingApps, setRefreshingApps] = useState(false);
  const [error, setError] = useState<string>();

  const loadCapabilities = useCallback(async (): Promise<void> => {
    setCapabilities(await loadHubCapabilities(authorization));
  }, [authorization]);
  const reportError = useCallback(
    (reason: unknown): void => {
      if (reason instanceof ApiClientError && reason.status === 403) {
        authorization.invalidatePermissions();
      }
      setError(readError(reason));
    },
    [authorization],
  );

  useEffect(() => {
    const reportPermissionError = (reason: unknown): void => {
      setError(readError(reason));
    };
    const timer = window.setTimeout(
      () => void loadCapabilities().catch(reportPermissionError),
      0,
    );
    const unsubscribe = authorization.onPermissionsInvalidated(() => {
      void loadCapabilities().catch(reportPermissionError);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [authorization, loadCapabilities]);

  const selected = useMemo(
    () =>
      detail && detail.app.id === selectedId
        ? { ...detail, releases, deployments }
        : undefined,
    [detail, selectedId, releases, deployments],
  );
  const releaseId =
    selectedReleaseId ??
    selected?.deployment.desiredReleaseId ??
    selected?.releases[0]?.id;
  const release = selected?.releases.find((entry) => entry.id === releaseId);
  const effectiveTab = selected
    ? resolveHubDetailTab(
        tab,
        {
          hasReleases: selected.hasReleases,
          deployed: Boolean(selected.app.currentDeploymentId),
        },
        capabilities,
      )
    : tab;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? apps.filter(
          ({ app }) =>
            app.name.toLowerCase().includes(needle) ||
            app.id.toLowerCase().includes(needle),
        )
      : apps;
  }, [apps, query]);

  const loadApps = useCallback(async (): Promise<readonly AppSummary[]> => {
    const response = await client.request<ApiResponse<readonly AppSummary[]>>({
      path: 'hub/apps',
    });
    setApps(response.data);
    return response.data;
  }, [client]);
  const loadDetail = useCallback(async (): Promise<void> => {
    if (!selectedId) return;
    const response = await client.request<ApiResponse<AppOverview>>({
      path: `hub/apps/${selectedId}`,
    });
    setDetail(response.data);
  }, [client, selectedId]);
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) return;
    void client
      .request<ApiResponse<AppOverview>>({ path: `hub/apps/${selectedId}` })
      .then((response) => {
        if (!cancelled) setDetail(response.data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) reportError(reason);
      });
    return () => {
      cancelled = true;
    };
  }, [client, reportError, selectedId]);
  const loadConfig = useCallback(
    async (appId: string): Promise<ConfigResponse> => {
      const response = await client.request<ApiResponse<ConfigResponse>>({
        path: `hub/apps/${appId}/config`,
      });
      setConfigMode(response.data.mode);
      setConfigContent(response.data.content ?? '');
      return response.data;
    },
    [client],
  );
  const loadReleaseConfig = useCallback(
    async (appId: string, releaseId: string): Promise<string | null> => {
      const response = await client.request<
        ApiResponse<ConfigTemplateResponse>
      >({ path: `hub/apps/${appId}/releases/${releaseId}/config-template` });
      return response.data.content;
    },
    [client],
  );
  const selectedAppId = selected?.app.id;
  const selectedCurrentDeploymentId = selected?.app.currentDeploymentId;

  useEffect(() => {
    if (selectedId) return;
    // Load the catalog only while it is visible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadApps()
      .catch(reportError)
      .finally(() => setLoading(false));
  }, [loadApps, reportError, selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    const pending =
      selected?.hasPendingDeployment || selected?.runtime.state === 'pending';
    if (!pending) return;
    const timer = window.setTimeout(() => {
      void loadDetail()
        .then(() => {
          if (effectiveTab === 'deployments') {
            setRefreshVersion((value) => value + 1);
          }
        })
        .catch(reportError);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [effectiveTab, selected, selectedId, loadDetail, reportError]);
  useEffect(() => {
    if (!selectedAppId) return;
    let cancelled = false;
    const key = `${selectedAppId}:${effectiveTab}`;
    const load = async (): Promise<void> => {
      if (effectiveTab === 'deployments') {
        setDeploymentsLoading(true);
        try {
          const response = await client.request<
            ApiResponse<{
              items: readonly DeploymentRecord[];
              page: number;
              pageSize: number;
              total: number;
            }>
          >({
            path: `hub/apps/${selectedAppId}/deployments`,
            query: { page: deploymentPage, pageSize: 20 },
          });
          if (!cancelled) {
            setDeployments(response.data.items);
            setDeploymentPagination({
              page: response.data.page,
              pageSize: response.data.pageSize,
              total: response.data.total,
            });
          }
        } finally {
          if (!cancelled) setDeploymentsLoading(false);
        }
      } else if (effectiveTab === 'releases') {
        const response = await client.request<
          ApiResponse<readonly ReleaseRecord[]>
        >({ path: `hub/apps/${selectedAppId}/releases` });
        if (!cancelled) setReleases(response.data);
      } else if (
        effectiveTab === 'configuration' ||
        effectiveTab === 'resources'
      ) {
        const response = await client.request<ApiResponse<ConfigResponse>>({
          path: `hub/apps/${selectedAppId}/config`,
        });
        if (!cancelled) {
          setConfigMode(response.data.mode);
          setConfigContent(response.data.content ?? '');
        }
      }
      if (!cancelled) setPanelKey(key);
    };
    void load().catch((reason: unknown) => {
      if (!cancelled) reportError(reason);
    });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    effectiveTab,
    selectedAppId,
    selectedCurrentDeploymentId,
    refreshVersion,
    deploymentPage,
    reportError,
  ]);

  const perform = async (
    work: () => Promise<void>,
    refreshDetail: boolean = true,
  ): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      if (refreshDetail && selectedId) await loadDetail();
      setRefreshVersion((value) => value + 1);
    } catch (reason) {
      reportError(reason);
    } finally {
      setBusy(false);
    }
  };
  const selectApp = (id: string, hasReleases?: boolean): void => {
    const app = apps.find((entry) => entry.app.id === id);
    setDetail(undefined);
    setReleases([]);
    setDeployments([]);
    setDeploymentPage(1);
    setDeploymentPagination({ page: 1, pageSize: 20, total: 0 });
    setPanelKey('');
    setSelectedId(id);
    setSelectedReleaseId(undefined);
    const releases = hasReleases ?? Boolean(app?.hasReleases);
    setTab(
      !releases
        ? 'development'
        : app?.app.currentDeploymentId
          ? 'deployments'
          : 'releases',
    );
  };

  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20 [&_button:not(:disabled)]:cursor-pointer'>
      <div className='mx-auto max-w-[1400px] px-5 py-8 sm:px-8'>
        {error ? (
          <ErrorBanner message={error} onClose={() => setError(undefined)} />
        ) : null}
        {selectedId && !selected ? (
          <div
            role='status'
            className='flex items-center gap-2 py-8 text-muted-foreground'
          >
            <LoaderCircle className='size-4 animate-spin' />
            Loading application…
            <Button variant='ghost' onClick={() => setSelectedId(undefined)}>
              Back
            </Button>
          </div>
        ) : !selected ? (
          <Catalog
            apps={filtered}
            total={apps.length}
            loading={loading}
            refreshing={refreshingApps}
            canCreate={capabilities.create}
            onRefresh={() => {
              setRefreshingApps(true);
              setError(undefined);
              void loadApps()
                .catch(reportError)
                .finally(() => setRefreshingApps(false));
            }}
            query={query}
            view={view}
            onQuery={setQuery}
            onView={setView}
            onCreate={() => setCreateOpen(true)}
            onSelect={selectApp}
          />
        ) : (
          <Detail
            app={selected}
            capabilities={capabilities}
            panelLoading={panelKey !== `${selectedAppId}:${effectiveTab}`}
            tab={effectiveTab}
            release={release}
            configMode={configMode}
            configContent={configContent}
            busy={busy}
            onBack={() => {
              setSelectedId(undefined);
            }}
            onTab={setTab}
            onRelease={setSelectedReleaseId}
            deploymentPagination={deploymentPagination}
            deploymentsLoading={deploymentsLoading}
            onDeploymentPage={setDeploymentPage}
            onRefresh={() =>
              void perform(async () => {
                await client.request({
                  path: `hub/apps/${selected.app.id}/refresh`,
                  method: 'POST',
                });
              })
            }
            onStart={() => setLifecycleAction('start')}
            onRestart={() => setLifecycleAction('restart')}
            onSaveSettings={(activation) =>
              void perform(async () => {
                await client.request({
                  path: `hub/apps/${selected.app.id}/settings`,
                  method: 'PUT',
                  json: { activation },
                });
              })
            }
            onSaveConfiguration={(content) =>
              void perform(async () => {
                const response = await client.request<
                  ApiResponse<ConfigResponse>
                >({
                  path: `hub/apps/${selected.app.id}/config`,
                  method: 'PUT',
                  json: { content },
                });
                setConfigContent(response.data.content ?? '');
              })
            }
            onRemove={() => setRemoveOpen(true)}
            onStop={() => setLifecycleAction('stop')}
            onDeploy={() => {
              setBusy(true);
              setError(undefined);
              void Promise.all([
                client.request<ApiResponse<readonly ReleaseRecord[]>>({
                  path: `hub/apps/${selected.app.id}/releases`,
                }),
                loadConfig(selected.app.id),
              ])
                .then(([response, config]) => {
                  setReleases(response.data);
                  const targetId = releaseId ?? response.data[0]?.id;
                  if (!targetId) return;
                  setDeploymentReleaseId(targetId);
                  setDeploymentMode(config.mode);
                  setDeploymentContent('');
                  setDeploymentBaseline(config.content ?? '');
                  setDeploymentBaselineMode(config.mode);
                  setRollbackDeploymentId(undefined);
                  setDeployOpen(true);
                })
                .catch(reportError)
                .finally(() => setBusy(false));
            }}
            onRollback={(deploymentId) => {
              const target = selected.deployments.find(
                (item) => item.id === deploymentId,
              );
              if (!target) return;
              setBusy(true);
              setError(undefined);
              void Promise.all([
                loadConfig(selected.app.id),
                client.request<ApiResponse<ReleaseRecord>>({
                  path: `hub/apps/${selected.app.id}/releases/${target.releaseId}`,
                }),
              ])
                .then(([config, release]) => {
                  setReleases([release.data]);
                  setDeploymentReleaseId(target.releaseId);
                  setDeploymentMode(target.config.mode);
                  setDeploymentContent('');
                  setDeploymentBaseline(config.content ?? '');
                  setDeploymentBaselineMode(config.mode);
                  setRollbackDeploymentId(deploymentId);
                  setDeployOpen(true);
                })
                .catch(reportError)
                .finally(() => setBusy(false));
            }}
            onUpload={() => setUploadOpen(true)}
          />
        )}
      </div>
      {createOpen && capabilities.create ? (
        <CreateDialog
          busy={busy}
          appId={newAppId}
          name={newAppName}
          onAppId={setNewAppId}
          onName={setNewAppName}
          onClose={() => setCreateOpen(false)}
          onCreate={() =>
            void perform(async () => {
              await client.request({
                path: 'hub/apps',
                method: 'POST',
                json: { id: newAppId, name: newAppName },
              });
              selectApp(newAppId, false);
              setNewAppId('');
              setNewAppName('');
              setCreateOpen(false);
            }, false)
          }
        />
      ) : null}
      {lifecycleAction && selected && capabilities[lifecycleAction] ? (
        <AppDialog
          title={`${lifecycleAction === 'start' ? 'Start' : lifecycleAction === 'stop' ? 'Stop' : 'Restart'} ${selected.app.name}?`}
          description={
            lifecycleAction === 'start'
              ? 'Start this application using its current release and configuration.'
              : lifecycleAction === 'stop'
                ? 'This application will be unavailable until you start it again. Its deployment and data will be retained.'
                : 'Stop and start this application using its current release and configuration. Access will be briefly interrupted; other applications will not be restarted.'
          }
          onClose={() => {
            if (!busy) setLifecycleAction(undefined);
          }}
        >
          <div className='mt-6 flex justify-end gap-2'>
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => setLifecycleAction(undefined)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              variant={lifecycleAction === 'stop' ? 'destructive' : 'default'}
              onClick={() =>
                void perform(async () => {
                  await client.request({
                    path: `hub/apps/${selected.app.id}/${lifecycleAction}`,
                    method: 'POST',
                  });
                  setLifecycleAction(undefined);
                })
              }
            >
              {busy ? <LoaderCircle className='size-4 animate-spin' /> : null}
              {lifecycleAction === 'start'
                ? 'Start'
                : lifecycleAction === 'stop'
                  ? 'Stop'
                  : 'Restart'}
            </Button>
          </div>
        </AppDialog>
      ) : null}
      {deployOpen &&
      selected &&
      capabilities[rollbackDeploymentId ? 'rollback' : 'deploy'] ? (
        <DeploymentDialog
          app={selected}
          releaseId={deploymentReleaseId}
          mode={deploymentMode}
          content={deploymentContent}
          baselineContent={deploymentBaseline}
          baselineMode={deploymentBaselineMode}
          rollback={Boolean(rollbackDeploymentId)}
          busy={busy}
          onRelease={setDeploymentReleaseId}
          loadTemplate={loadReleaseConfig}
          onMode={setDeploymentMode}
          onContent={setDeploymentContent}
          onClose={() => setDeployOpen(false)}
          onComplete={() =>
            void perform(async () => {
              if (!deploymentReleaseId || deploymentMode === 'managed') return;
              const endpoint = rollbackDeploymentId ? 'rollback' : 'deploy';
              await client.request({
                path: `hub/apps/${selected.app.id}/${endpoint}`,
                method: 'POST',
                json: {
                  ...(rollbackDeploymentId
                    ? { deploymentId: rollbackDeploymentId }
                    : { releaseId: deploymentReleaseId }),
                  config: {
                    mode: deploymentMode,
                    ...(deploymentMode === 'file'
                      ? { content: deploymentContent }
                      : {}),
                  },
                },
              });
              setSelectedReleaseId(deploymentReleaseId);
              setDeployOpen(false);
              setRollbackDeploymentId(undefined);
              setTab('deployments');
              setDeploymentPage(1);
            })
          }
        />
      ) : null}
      {uploadOpen && selected && capabilities['upload-release'] ? (
        <UploadReleaseDialog
          artifact={artifact}
          busy={busy}
          onArtifact={setArtifact}
          onClose={() => setUploadOpen(false)}
          onUpload={() =>
            void perform(async () => {
              if (!artifact) return;
              const uploaded = await uploadArtifact(selected.app.id, artifact);
              setSelectedReleaseId(uploaded.id);
              setArtifact(undefined);
              setUploadOpen(false);
            })
          }
        />
      ) : null}
      {removeOpen && selected && capabilities.remove ? (
        <RemoveApplicationDialog
          app={selected}
          busy={busy}
          onClose={() => setRemoveOpen(false)}
          onRemove={() =>
            void perform(async () => {
              await client.request({
                path: `hub/apps/${selected.app.id}`,
                method: 'DELETE',
              });
              setSelectedId(undefined);
              setRemoveOpen(false);
            }, false)
          }
        />
      ) : null}
    </main>
  );
}

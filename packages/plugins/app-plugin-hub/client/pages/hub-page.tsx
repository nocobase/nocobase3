import { LoaderCircle } from 'lucide-react';
import { apiClientToken, useService } from '@nocobase/app-client';
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

export default function HubPage(): ReactElement {
  const client = useService(apiClientToken);
  const [apps, setApps] = useState<readonly AppSummary[]>([]);
  const [detail, setDetail] = useState<AppOverview>();
  const [releases, setReleases] = useState<readonly ReleaseRecord[]>([]);
  const [deployments, setDeployments] = useState<readonly DeploymentRecord[]>(
    [],
  );
  const [panelKey, setPanelKey] = useState('');
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
        if (!cancelled) setError(readError(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [client, selectedId]);
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
      .catch((reason: unknown) => setError(readError(reason)))
      .finally(() => setLoading(false));
  }, [loadApps, selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    const pending =
      selected?.hasPendingDeployment || selected?.runtime.state === 'pending';
    if (!pending) return;
    const timer = window.setTimeout(() => {
      void loadDetail()
        .then(() => {
          if (tab === 'deployments') setRefreshVersion((value) => value + 1);
        })
        .catch((reason: unknown) => setError(readError(reason)));
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [selected, selectedId, loadDetail, tab]);
  useEffect(() => {
    if (!selectedAppId) return;
    let cancelled = false;
    const key = `${selectedAppId}:${tab}`;
    const load = async (): Promise<void> => {
      if (tab === 'deployments') {
        const response = await client.request<
          ApiResponse<readonly DeploymentRecord[]>
        >({ path: `hub/apps/${selectedAppId}/deployments` });
        if (!cancelled) setDeployments(response.data);
      } else if (tab === 'releases') {
        const response = await client.request<
          ApiResponse<readonly ReleaseRecord[]>
        >({ path: `hub/apps/${selectedAppId}/releases` });
        if (!cancelled) setReleases(response.data);
      } else if (tab === 'configuration' || tab === 'resources') {
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
      if (!cancelled) setError(readError(reason));
    });
    return () => {
      cancelled = true;
    };
  }, [client, tab, selectedAppId, selectedCurrentDeploymentId, refreshVersion]);

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
      setError(readError(reason));
    } finally {
      setBusy(false);
    }
  };
  const selectApp = (id: string, hasReleases?: boolean): void => {
    const app = apps.find((entry) => entry.app.id === id);
    setDetail(undefined);
    setReleases([]);
    setDeployments([]);
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
            onRefresh={() => {
              setRefreshingApps(true);
              setError(undefined);
              void loadApps()
                .catch((reason: unknown) => setError(readError(reason)))
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
            panelLoading={panelKey !== `${selectedAppId}:${tab}`}
            tab={tab}
            release={release}
            configMode={configMode}
            configContent={configContent}
            busy={busy}
            onBack={() => {
              setSelectedId(undefined);
            }}
            onTab={setTab}
            onRelease={setSelectedReleaseId}
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
                .catch((reason: unknown) => setError(readError(reason)))
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
                .catch((reason: unknown) => setError(readError(reason)))
                .finally(() => setBusy(false));
            }}
            onUpload={() => setUploadOpen(true)}
          />
        )}
      </div>
      {createOpen ? (
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
      {lifecycleAction && selected ? (
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
      {deployOpen && selected ? (
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
            })
          }
        />
      ) : null}
      {uploadOpen && selected ? (
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
      {removeOpen && selected ? (
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

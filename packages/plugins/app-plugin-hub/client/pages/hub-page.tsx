import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Boxes,
  Columns2,
  PanelLeft,
  PanelRight,
  Check,
  ChevronRight,
  CircleStop,
  Clipboard,
  ClipboardCheck,
  CloudUpload,
  Code2,
  Database,
  ExternalLink,
  FileCode2,
  Grid2X2,
  HardDrive,
  Info,
  List,
  LoaderCircle,
  MoreHorizontal,
  PackageOpen,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Shapes,
  Sparkles,
  Trash2,
  TriangleAlert,
  Zap,
  X,
} from 'lucide-react';
import {
  appApiClientToken,
  resolveAppUrl,
  useService,
} from '@nocobase/app-client';
import { Badge } from '../components/ui/badge.js';
import { Alert, AlertDescription } from '../components/ui/alert.js';
import { Avatar, AvatarFallback } from '../components/ui/avatar.js';
import { Button } from '../components/ui/button.js';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '../components/ui/card.js';
import {
  Dialog as UiDialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group.js';
import {
  Empty as ShadcnEmpty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../components/ui/empty.js';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { parse as parseYaml } from 'yaml';

type ConfigMode = 'file' | 'managed' | 'external';
type ActivationPolicy = 'eager' | 'lazy';
type ViewMode = 'grid' | 'list';
type DetailTab =
  | 'deployments'
  | 'releases'
  | 'development'
  | 'resources'
  | 'configuration'
  | 'settings';

const ConfigEditor = lazy(async () => {
  const module = await import('../components/config-editor.js');
  return { default: module.ConfigEditor };
});
const ConfigMergeEditor = lazy(async () => {
  const module = await import('../components/config-editor.js');
  return { default: module.ConfigMergeEditor };
});
const ConfigUnifiedDiff = lazy(async () => {
  const module = await import('../components/config-editor.js');
  return { default: module.ConfigUnifiedDiff };
});

interface ReleaseRecord {
  readonly id: string;
  readonly version: string;
  readonly size: number;
  readonly checksum: string;
  readonly hasConfigTemplate: boolean;
  readonly createdAt: string;
}
interface DeploymentRecord {
  readonly release: {
    readonly version: string;
    readonly checksum: string;
  } | null;
  readonly id: string;
  readonly releaseId: string;
  readonly kind: 'deploy' | 'rollback';
  readonly status:
    'queued' | 'deploying' | 'succeeded' | 'failed' | 'cancelled';
  readonly phase: string;
  readonly config: { readonly mode: 'file' | 'external' };
  readonly cacheHit: boolean | null;
  readonly error: string | null;
  readonly createdAt: string;
}
interface AppDetail {
  readonly enabled: boolean;
  readonly hasReleases: boolean;
  readonly hasPendingDeployment: boolean;
  readonly currentVersion: string | null;
  readonly app: {
    readonly id: string;
    readonly name: string;
    readonly updatedAt: string;
    readonly currentDeploymentId: string | null;
  };
  readonly deployments: readonly DeploymentRecord[];
  readonly runtime: {
    readonly hostAvailable: boolean;
    readonly state: string;
  };
  readonly deployment: {
    readonly desiredReleaseId: string | null;
    readonly observedReleaseId: string | null;
    readonly observedState: string;
    readonly activation: ActivationPolicy;
    readonly basePath: string;
    readonly updatedAt: string;
  };
  readonly releases: readonly ReleaseRecord[];
  readonly hostUrl: string | null;
}
interface ApiResponse<T> {
  readonly data: T;
}
interface AppSummary {
  readonly app: AppDetail['app'];
  readonly runtime: AppDetail['runtime'];
  readonly currentVersion: string | null;
  readonly hasReleases: boolean;
  readonly hasPendingDeployment: boolean;
}
type AppOverview = Omit<AppDetail, 'releases' | 'deployments'>;
interface ConfigResponse {
  readonly mode: 'file' | 'external';
  readonly content: string | null;
}
interface ConfigTemplateResponse {
  readonly content: string | null;
}

const CONFIG_MODES: readonly {
  readonly value: ConfigMode;
  readonly title: string;
  readonly description: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
}[] = [
  {
    value: 'file',
    title: 'Config file',
    description: 'Maintain an editable config.yml with the application.',
    icon: <FileCode2 />,
  },
  {
    value: 'managed',
    title: 'Hub managed',
    description: 'Store structured configuration and secrets in Hub.',
    icon: <Sparkles />,
    disabled: true,
  },
  {
    value: 'external',
    title: 'External',
    description: 'Supply configuration through external infrastructure.',
    icon: <ExternalLink />,
  },
];

const TAB_LABELS: Readonly<Record<DetailTab, string>> = {
  deployments: 'Deployments',
  releases: 'Releases',
  development: 'Development',
  resources: 'Resources',
  configuration: 'Configuration',
  settings: 'Settings',
};

export default function HubPage(): ReactElement {
  const client = useService(appApiClientToken);
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
    const response =
      await client.request<ApiResponse<readonly AppSummary[]>>('hub/apps');
    setApps(response.data);
    return response.data;
  }, [client]);
  const loadDetail = useCallback(async (): Promise<void> => {
    if (!selectedId) return;
    const response = await client.request<ApiResponse<AppOverview>>(
      `hub/apps/${selectedId}`,
    );
    setDetail(response.data);
  }, [client, selectedId]);
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) return;
    void client
      .request<ApiResponse<AppOverview>>(`hub/apps/${selectedId}`)
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
      const response = await client.request<ApiResponse<ConfigResponse>>(
        `hub/apps/${appId}/config`,
      );
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
      >(`hub/apps/${appId}/releases/${releaseId}/config-template`);
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
        >(`hub/apps/${selectedAppId}/deployments`);
        if (!cancelled) setDeployments(response.data);
      } else if (tab === 'releases') {
        const response = await client.request<
          ApiResponse<readonly ReleaseRecord[]>
        >(`hub/apps/${selectedAppId}/releases`);
        if (!cancelled) setReleases(response.data);
      } else if (tab === 'configuration' || tab === 'resources') {
        const response = await client.request<ApiResponse<ConfigResponse>>(
          `hub/apps/${selectedAppId}/config`,
        );
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
                await client.request(`hub/apps/${selected.app.id}/refresh`, {
                  method: 'POST',
                });
              })
            }
            onStart={() => setLifecycleAction('start')}
            onRestart={() => setLifecycleAction('restart')}
            onSaveSettings={(activation) =>
              void perform(async () => {
                await client.request(`hub/apps/${selected.app.id}/settings`, {
                  method: 'PUT',
                  body: JSON.stringify({ activation }),
                });
              })
            }
            onSaveConfiguration={(content) =>
              void perform(async () => {
                const response = await client.request<
                  ApiResponse<ConfigResponse>
                >(`hub/apps/${selected.app.id}/config`, {
                  method: 'PUT',
                  body: JSON.stringify({ content }),
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
                client.request<ApiResponse<readonly ReleaseRecord[]>>(
                  `hub/apps/${selected.app.id}/releases`,
                ),
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
                client.request<ApiResponse<ReleaseRecord>>(
                  `hub/apps/${selected.app.id}/releases/${target.releaseId}`,
                ),
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
              await client.request('hub/apps', {
                method: 'POST',
                body: JSON.stringify({ id: newAppId, name: newAppName }),
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
                  await client.request(
                    `hub/apps/${selected.app.id}/${lifecycleAction}`,
                    { method: 'POST' },
                  );
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
              await client.request(`hub/apps/${selected.app.id}/${endpoint}`, {
                method: 'POST',
                body: JSON.stringify({
                  ...(rollbackDeploymentId
                    ? { deploymentId: rollbackDeploymentId }
                    : { releaseId: deploymentReleaseId }),
                  config: {
                    mode: deploymentMode,
                    ...(deploymentMode === 'file'
                      ? { content: deploymentContent }
                      : {}),
                  },
                }),
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
              await client.request(`hub/apps/${selected.app.id}`, {
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

function Catalog({
  apps,
  total,
  loading,
  refreshing,
  onRefresh,
  query,
  view,
  onQuery,
  onView,
  onCreate,
  onSelect,
}: {
  readonly apps: readonly AppSummary[];
  readonly total: number;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly query: string;
  readonly view: ViewMode;
  readonly onQuery: (value: string) => void;
  readonly onView: (value: ViewMode) => void;
  readonly onCreate: () => void;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  return (
    <>
      <header className='mb-7 flex flex-wrap items-end justify-between gap-4'>
        <div>
          <div className='mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground'>
            <Boxes className='size-4' /> Application Hub
          </div>
          <h1 className='text-3xl font-semibold tracking-tight'>
            Applications
          </h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            Create, deploy, and operate applications from a single workspace.
          </p>
        </div>
      </header>
      <div className='mb-5 flex flex-wrap items-center gap-3'>
        <label className='flex h-10 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border bg-background px-3'>
          <Search className='size-4 text-muted-foreground' />
          <Input
            className='h-auto border-0 p-0 focus-visible:ring-0'
            onChange={(event) => onQuery(event.target.value)}
            placeholder='Search applications…'
            value={query}
          />
        </label>
        <div className='ml-auto flex items-center gap-3'>
          <div className='flex h-10 items-center rounded-lg border bg-background p-1'>
            <ViewButton
              active={view === 'grid'}
              label='Grid view'
              onClick={() => onView('grid')}
              icon={<Grid2X2 />}
            />
            <ViewButton
              active={view === 'list'}
              label='List view'
              onClick={() => onView('list')}
              icon={<List />}
            />
          </div>
          <Button
            className='h-10'
            variant='outline'
            disabled={loading || refreshing}
            onClick={onRefresh}
          >
            <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
            Refresh
          </Button>
          <Button className='h-10' onClick={onCreate}>
            <Plus className='size-4' /> New application
          </Button>
        </div>
      </div>
      {loading ? (
        <Empty
          icon={<LoaderCircle className='animate-spin' />}
          title='Loading applications'
        />
      ) : apps.length ? (
        view === 'grid' ? (
          <div className='grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {apps.map((app) => (
              <AppCard
                app={app}
                key={app.app.id}
                onClick={() => onSelect(app.app.id)}
              />
            ))}
          </div>
        ) : (
          <Card className='overflow-hidden py-0'>
            <Table>
              <TableHeader>
                <TableRow className='hover:bg-transparent'>
                  <TableHead>Application</TableHead>
                  <TableHead className='w-36'>Status</TableHead>
                  <TableHead className='w-40'>Release</TableHead>
                  <TableHead className='w-12'>
                    <span className='sr-only'>Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <AppListRow
                    app={app}
                    key={app.app.id}
                    onClick={() => onSelect(app.app.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
        )
      ) : (
        <Empty
          icon={<PackageOpen />}
          title={total ? 'No applications found' : 'No applications yet'}
          description={
            total
              ? 'Try a different search.'
              : 'Create an application and upload its first release.'
          }
          action={
            total ? undefined : (
              <Button className='mt-5' onClick={onCreate}>
                <Plus className='size-4' /> New application
              </Button>
            )
          }
        />
      )}
    </>
  );
}

function AppCard({
  app,
  onClick,
}: {
  readonly app: AppSummary;
  readonly onClick: () => void;
}): ReactElement {
  const version = app.currentVersion;
  return (
    <Card className='group relative overflow-hidden p-0 transition hover:border-primary/40 hover:shadow-md'>
      <Button
        className='h-auto w-full flex-col items-stretch rounded-xl p-0 text-left'
        onClick={onClick}
        variant='ghost'
      >
        <CardHeader className='p-3.5 pr-32 pb-2.5'>
          <div className='flex min-w-0 items-center gap-2.5'>
            <AppMark name={app.app.name} small />
            <div className='min-w-0 flex-1'>
              <h2 className='truncate text-sm font-semibold'>{app.app.name}</h2>
              <p className='truncate font-mono text-[11px] text-muted-foreground'>
                {app.app.id}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className='flex items-center gap-2 px-3.5 pt-1 pb-3 text-[11px] text-muted-foreground'>
          <span className='font-medium text-foreground'>
            {version ? `v${version}` : 'Not deployed'}
          </span>
          <span aria-hidden='true'>·</span>
          <span>{formatDate(app.app.updatedAt)}</span>
        </CardContent>
      </Button>
      <div className='pointer-events-none absolute top-4 right-4'>
        <StatusBadge state={app.runtime.state} />
      </div>
      <ChevronRight className='pointer-events-none absolute right-3 bottom-3 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5' />
    </Card>
  );
}
function AppListRow({
  app,
  onClick,
}: {
  readonly app: AppSummary;
  readonly onClick: () => void;
}): ReactElement {
  const version = app.currentVersion;
  return (
    <TableRow className='cursor-pointer' onClick={onClick}>
      <TableCell>
        <div className='flex min-w-0 items-center gap-3'>
          <AppMark name={app.app.name} small />
          <div className='min-w-0'>
            <div className='truncate font-medium'>{app.app.name}</div>
            <div className='truncate font-mono text-xs text-muted-foreground'>
              {app.app.id}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge state={app.runtime.state} />
      </TableCell>
      <TableCell className='text-sm text-muted-foreground'>
        {version ? `v${version}` : 'Not deployed'}
      </TableCell>
      <TableCell>
        <Button
          aria-label={`Open ${app.app.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          size='icon'
          variant='ghost'
        >
          <ChevronRight />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function Detail({
  panelLoading,
  app,
  tab,
  release,
  configMode,
  configContent,
  busy,
  onBack,
  onTab,
  onRelease,
  onRefresh,
  onStart,
  onRestart,
  onSaveSettings,
  onSaveConfiguration,
  onRemove,
  onStop,
  onDeploy,
  onRollback,
  onUpload,
}: {
  readonly panelLoading: boolean;
  readonly app: AppDetail;
  readonly tab: DetailTab;
  readonly release: ReleaseRecord | undefined;
  readonly configMode: ConfigMode;
  readonly configContent: string;
  readonly busy: boolean;
  readonly onBack: () => void;
  readonly onTab: (tab: DetailTab) => void;
  readonly onRelease: (id: string) => void;
  readonly onRefresh: () => void;
  readonly onStart: () => void;
  readonly onRestart: () => void;
  readonly onSaveSettings: (activation: ActivationPolicy) => void;
  readonly onSaveConfiguration: (content: string) => void;
  readonly onRemove: () => void;
  readonly onStop: () => void;
  readonly onDeploy: () => void;
  readonly onRollback: (deploymentId: string) => void;
  readonly onUpload: () => void;
}): ReactElement {
  const deployed = hasDeployment(app);
  const detailTabs: readonly DetailTab[] = [
    ...(!app.hasReleases ? (['development'] as const) : []),
    'deployments',
    'releases',
    'resources',
    ...(deployed ? (['configuration'] as const) : []),
    'settings',
  ];
  const activeTab = detailTabs.includes(tab)
    ? tab
    : !app.hasReleases
      ? 'development'
      : deployed
        ? 'deployments'
        : 'releases';
  const visitUrl = applicationUrl(app);
  const running = app.deployment.observedState === 'running';
  const visitAllowed =
    app.runtime.hostAvailable &&
    (running ||
      (app.runtime.state === 'stopped' &&
        app.enabled &&
        app.deployment.activation === 'lazy'));
  const transitioning =
    app.hasPendingDeployment || app.runtime.state === 'pending';
  return (
    <>
      <Button
        className='mb-5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground'
        onClick={onBack}
        variant='ghost'
      >
        <ArrowLeft className='size-4' /> All applications
      </Button>
      <section className='overflow-hidden rounded-2xl border bg-card shadow-sm'>
        <Tabs
          value={activeTab}
          onValueChange={(value) => onTab(value as DetailTab)}
        >
          <header className='border-b px-6 pt-6'>
            <div className='flex flex-wrap items-start justify-between gap-5 pb-6'>
              <div className='flex items-start gap-4'>
                <AppMark name={app.app.name} />
                <div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h1 className='text-2xl font-semibold'>{app.app.name}</h1>
                    <StatusBadge state={app.deployment.observedState} />
                  </div>
                  <p className='mt-1 font-mono text-xs text-muted-foreground'>
                    {app.app.id} · {app.deployment.basePath}
                  </p>
                  <div className='mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground'>
                    <span>
                      Release{' '}
                      <strong className='font-medium text-foreground'>
                        {app.currentVersion
                          ? `v${app.currentVersion}`
                          : 'Not deployed'}
                      </strong>
                    </span>
                    <span>
                      Startup{' '}
                      <strong className='font-medium text-foreground'>
                        {app.deployment.activation === 'eager'
                          ? 'With Hub'
                          : 'On first visit'}
                      </strong>
                    </span>
                    <span>Updated {formatDate(app.deployment.updatedAt)}</span>
                  </div>
                </div>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button disabled={busy} onClick={onRefresh} variant='outline'>
                  <RefreshCw
                    className={`size-4 ${busy ? 'animate-spin' : ''}`}
                  />{' '}
                  Refresh status
                </Button>
                {visitUrl && visitAllowed ? (
                  <Button
                    className='cursor-pointer'
                    disabled={busy}
                    render={
                      <a href={visitUrl} rel='noreferrer' target='_blank' />
                    }
                    variant='outline'
                  >
                    <ExternalLink className='size-4' /> Visit
                  </Button>
                ) : (
                  <Button disabled variant='outline'>
                    <ExternalLink className='size-4' /> Visit
                  </Button>
                )}
                <Button
                  disabled={
                    busy ||
                    !deployed ||
                    !app.runtime.hostAvailable ||
                    transitioning
                  }
                  onClick={running ? onRestart : onStart}
                  variant='outline'
                >
                  {running ? (
                    <RefreshCw className='size-4' />
                  ) : (
                    <Play className='size-4' />
                  )}{' '}
                  {running ? 'Restart' : 'Start'}
                </Button>
                <Button
                  disabled={
                    busy ||
                    !running ||
                    !app.runtime.hostAvailable ||
                    transitioning
                  }
                  onClick={onStop}
                  variant='outline'
                >
                  <CircleStop className='size-4' /> Stop
                </Button>
              </div>
            </div>
            <TabsList>
              {detailTabs.map((item) => (
                <TabsTrigger key={item} value={item}>
                  {TAB_LABELS[item]}
                </TabsTrigger>
              ))}
            </TabsList>
          </header>
          <div className='p-6'>
            {panelLoading ? (
              <div
                role='status'
                className='flex items-center gap-2 text-muted-foreground'
              >
                <LoaderCircle className='size-4 animate-spin' />
                Loading…
              </div>
            ) : (
              <>
                <TabsContent value='deployments'>
                  <Deployments
                    app={app}
                    busy={busy || transitioning}
                    onDeploy={onDeploy}
                    onRollback={onRollback}
                  />
                </TabsContent>
                <TabsContent value='releases'>
                  <Releases
                    app={app}
                    selected={release?.id}
                    onSelect={onRelease}
                    onUpload={onUpload}
                  />
                </TabsContent>
                {!app.hasReleases ? (
                  <TabsContent value='development'>
                    <Development appId={app.app.id} />
                  </TabsContent>
                ) : null}
                <TabsContent value='resources'>
                  <Resources mode={configMode} content={configContent} />
                </TabsContent>
                {deployed ? (
                  <TabsContent value='configuration'>
                    <Configuration
                      key={`${app.app.id}:${app.app.currentDeploymentId}`}
                      mode={configMode}
                      content={configContent}
                      busy={busy || transitioning}
                      onSave={onSaveConfiguration}
                    />
                  </TabsContent>
                ) : null}
                <TabsContent value='settings'>
                  <Settings
                    key={app.deployment.activation}
                    activation={app.deployment.activation}
                    busy={busy}
                    onSave={onSaveSettings}
                    onRemove={onRemove}
                  />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </section>
    </>
  );
}

function Deployments({
  app,
  busy,
  onDeploy,
  onRollback,
}: {
  readonly app: AppDetail;
  readonly busy: boolean;
  readonly onDeploy: () => void;
  readonly onRollback: (deploymentId: string) => void;
}): ReactElement {
  if (app.deployments.length === 0) {
    return (
      <Empty
        icon={<Boxes />}
        title='No deployments yet'
        description='Deploy a release to create the first deployment.'
        action={
          <Button disabled={busy || !app.hasReleases} onClick={onDeploy}>
            <Play className='size-4' /> Deploy
          </Button>
        }
      />
    );
  }
  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='font-semibold'>Deployments</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Each row is a deployment operation. Rolling back creates a new
            deployment using the selected release and configuration.
          </p>
        </div>
        <Button disabled={busy || !app.hasReleases} onClick={onDeploy}>
          <Play className='size-4' /> Deploy
        </Button>
      </div>
      <div className='overflow-hidden rounded-lg border bg-card'>
        <Table>
          <TableHeader className='bg-muted/20'>
            <TableRow>
              <TableHead className='w-[34%]'>Release</TableHead>
              <TableHead className='w-[26%]'>Deployment</TableHead>
              <TableHead className='w-[20%]'>Status</TableHead>
              <TableHead className='w-[20%]'>Created</TableHead>
              <TableHead className='w-12'>
                <span className='sr-only'>Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {app.deployments.map((deployment) => {
              const deployedRelease = deployment.release;
              const current = deployment.id === app.app.currentDeploymentId;
              return (
                <TableRow
                  className={
                    current
                      ? 'bg-primary/[0.025] hover:bg-primary/[0.045]'
                      : undefined
                  }
                  key={deployment.id}
                >
                  <TableCell className='py-3'>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium tabular-nums'>
                        {deployedRelease
                          ? `v${deployedRelease.version}`
                          : 'Unknown'}
                      </span>
                      {current ? (
                        <Badge className='bg-emerald-500/10 text-emerald-700'>
                          Current
                        </Badge>
                      ) : null}
                    </div>
                    {deployedRelease ? (
                      <div className='mt-0.5 font-mono text-[11px] text-muted-foreground'>
                        {deployedRelease.checksum.slice(0, 12)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className='py-3'>
                    <DeploymentId value={deployment.id} />
                    <div className='mt-0.5 text-xs text-muted-foreground'>
                      {deployment.kind === 'rollback'
                        ? 'Rolled back'
                        : 'Deployed'}
                    </div>
                  </TableCell>
                  <TableCell className='py-3'>
                    <DeploymentStatus deployment={deployment} />
                  </TableCell>
                  <TableCell className='whitespace-nowrap py-3 text-sm text-muted-foreground tabular-nums'>
                    {formatDateTime(deployment.createdAt)}
                  </TableCell>
                  <TableCell className='py-3 text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            aria-label={`Actions for deployment ${shortId(deployment.id)}`}
                            className='size-8 text-muted-foreground'
                            size='icon'
                            variant='ghost'
                          >
                            <MoreHorizontal />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align='end' className='w-40'>
                        <DropdownMenuItem
                          disabled={
                            busy || deployment.status !== 'succeeded' || current
                          }
                          onClick={() => onRollback(deployment.id)}
                        >
                          <RotateCcw />
                          Roll back
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DeploymentId({ value }: { readonly value: string }): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <Button
      aria-label='Copy deployment ID'
      className='group/deployment-id h-auto cursor-copy gap-1 rounded-none p-0 text-sm font-medium tabular-nums hover:bg-transparent hover:text-primary [&_svg]:size-3.5'
      onClick={() => void copy()}
      variant='ghost'
    >
      {shortId(value)}
      {copied ? (
        <ClipboardCheck className='text-muted-foreground' />
      ) : (
        <Clipboard className='opacity-0 transition-opacity group-hover/deployment-id:opacity-100 group-focus-visible/deployment-id:opacity-100' />
      )}
    </Button>
  );
}

function DeploymentStatus({
  deployment,
}: {
  readonly deployment: DeploymentRecord;
}): ReactElement {
  if (deployment.status === 'deploying') {
    return (
      <Badge
        className='gap-1.5 whitespace-nowrap bg-amber-500/10 text-amber-700'
        role='status'
      >
        <span className='size-1.5 rounded-full bg-amber-500' />
        {deploymentPhaseLabel(deployment.phase)}
      </Badge>
    );
  }
  return (
    <div className='space-y-1'>
      <div className='flex items-center gap-2'>
        <StatusBadge state={deployment.status} />
        {deployment.cacheHit ? (
          <Badge className='bg-sky-500/10 text-sky-700 dark:text-sky-300'>
            Cache reused
          </Badge>
        ) : null}
      </div>
      {deployment.error ? <DeploymentError message={deployment.error} /> : null}
    </div>
  );
}

function DeploymentError({
  message,
}: {
  readonly message: string;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <div className='mt-1 flex max-w-80 items-center gap-1'>
      <Button
        className='h-6 min-w-0 flex-1 justify-start px-1 text-xs text-destructive hover:text-destructive'
        onClick={() => setOpen(true)}
        title={message}
        variant='ghost'
      >
        <span className='truncate'>{message}</span>
      </Button>
      <Button
        aria-label='Copy deployment error'
        className='size-6 shrink-0 text-destructive hover:text-destructive'
        onClick={() => void copy()}
        size='icon'
        title={copied ? 'Copied' : 'Copy error'}
        variant='ghost'
      >
        {copied ? <ClipboardCheck /> : <Clipboard />}
      </Button>
      {open ? (
        <AppDialog
          title='Deployment error'
          description='The deployment did not complete successfully.'
          onClose={() => setOpen(false)}
          wide
        >
          <pre className='max-h-[24rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-red-200'>
            {message}
          </pre>
          <div className='mt-5 flex justify-end gap-2'>
            <Button onClick={() => setOpen(false)} variant='outline'>
              Close
            </Button>
            <Button onClick={() => void copy()}>
              {copied ? <ClipboardCheck /> : <Clipboard />}
              {copied ? 'Copied' : 'Copy error'}
            </Button>
          </div>
        </AppDialog>
      ) : null}
    </div>
  );
}

function Releases({
  app,
  selected,
  onSelect,
  onUpload,
}: {
  readonly app: AppDetail;
  readonly selected: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onUpload: () => void;
}): ReactElement {
  return (
    <div>
      <div className='mb-5 flex items-center justify-between'>
        <div>
          <h2 className='font-semibold'>Releases</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Upload and inspect immutable release artifacts for this application.
          </p>
        </div>
        <div className='flex gap-2'>
          <Button onClick={onUpload} variant='outline'>
            <CloudUpload className='size-4' /> Upload release
          </Button>
        </div>
      </div>
      <div className='overflow-hidden rounded-xl border'>
        {app.releases.length ? (
          app.releases.map((item) => (
            <Button
              className={`grid h-auto w-full grid-cols-[minmax(0,1fr)_120px_140px] justify-stretch rounded-none border-b px-4 py-3 text-left text-sm last:border-0 ${selected === item.id ? 'bg-primary/5' : ''}`}
              key={item.id}
              onClick={() => onSelect(item.id)}
              variant='ghost'
            >
              <span className='flex items-center gap-3'>
                <Archive className='size-4 text-muted-foreground' />
                <span>
                  <span className='block font-medium'>v{item.version}</span>
                  <span className='font-mono text-[11px] text-muted-foreground'>
                    {item.checksum.slice(0, 12)}
                  </span>
                </span>
                {item.id === app.deployment.observedReleaseId ? (
                  <Badge className='bg-emerald-500/10 text-emerald-700'>
                    Active
                  </Badge>
                ) : null}
              </span>
              <span className='text-muted-foreground'>
                {formatBytes(item.size)}
              </span>
              <span className='text-muted-foreground'>
                {formatDate(item.createdAt)}
              </span>
            </Button>
          ))
        ) : (
          <Empty icon={<Archive />} title='No releases uploaded' />
        )}
      </div>
    </div>
  );
}
type ResourceKind = 'databases' | 'drives' | 'caching' | 'llm';

interface ResourceSummary {
  readonly key: string;
  readonly type: string;
  readonly isDefault: boolean;
  readonly details: readonly ResourceDetail[];
}

interface ResourceDetail {
  readonly label: string;
  readonly value: string;
}

function Resources({
  mode,
  content,
}: {
  readonly mode: ConfigMode;
  readonly content: string;
}): ReactElement {
  const [kind, setKind] = useState<ResourceKind>('databases');
  const groups = resourceGroups(content);
  const navigation: readonly {
    readonly value: ResourceKind;
    readonly label: string;
    readonly icon: ReactNode;
  }[] = [
    { value: 'databases', label: 'Databases', icon: <Database /> },
    { value: 'drives', label: 'Drives', icon: <HardDrive /> },
    { value: 'caching', label: 'Caching', icon: <Zap /> },
    { value: 'llm', label: 'LLM services', icon: <Shapes /> },
  ];
  return (
    <Tabs
      className='grid min-h-80 grid-cols-[11rem_minmax(0,1fr)] gap-6'
      onValueChange={(value) => setKind(value as ResourceKind)}
      orientation='vertical'
      value={kind}
    >
      <TabsList className='h-fit flex-col items-stretch gap-1 overflow-visible'>
        {navigation.map((item) => (
          <TabsTrigger
            className={(state) =>
              `flex w-full flex-row items-center justify-start gap-2 rounded-md border-0 px-3 py-2.5 text-left ${state.active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted/60'}`
            }
            key={item.value}
            value={item.value}
          >
            <span className='inline-flex shrink-0 items-center justify-center [&_svg]:size-4'>
              {item.icon}
            </span>
            <span className='min-w-0 truncate'>{item.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <div className='min-w-0'>
        {navigation.map((item) => (
          <TabsContent key={item.value} value={item.value}>
            <div className='mb-5'>
              <h2 className='font-semibold'>{item.label}</h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                {resourceDescription(item.value)}
              </p>
            </div>
            <ResourceTable
              external={mode === 'external'}
              items={groups[item.value]}
              kind={item.value}
            />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

function ResourceTable({
  external,
  items,
  kind,
}: {
  readonly external: boolean;
  readonly items: readonly ResourceSummary[];
  readonly kind: ResourceKind;
}): ReactElement {
  if (items.length === 0) {
    return (
      <Empty
        icon={kind === 'llm' ? <Shapes /> : <PackageOpen />}
        title={`No ${resourceLabel(kind)} found`}
        description={
          external
            ? 'This application uses external configuration, so Hub cannot inspect its resource keys.'
            : kind === 'llm'
              ? 'LLM services are managed by the application and will appear here when the management API is connected.'
              : 'No matching keys were found in the current config.yml.'
        }
      />
    );
  }
  return (
    <div className='overflow-hidden rounded-xl border'>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            <TableHead>Key</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Details</TableHead>
            <TableHead className='w-28'>Default</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.key}>
              <TableCell className='font-mono text-xs'>{item.key}</TableCell>
              <TableCell>
                <Badge className='bg-sky-500/10 text-sky-700'>
                  {item.type}
                </Badge>
              </TableCell>
              <TableCell>
                {item.details.length ? (
                  <dl className='flex flex-wrap gap-x-4 gap-y-1 text-xs'>
                    {item.details.map((detail) => (
                      <div
                        className='flex min-w-0 items-baseline gap-1.5'
                        key={detail.label}
                      >
                        <dt className='shrink-0 text-muted-foreground'>
                          {detail.label}
                        </dt>
                        <dd
                          className='max-w-56 truncate font-mono text-foreground'
                          title={detail.value}
                        >
                          {detail.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </TableCell>
              <TableCell>
                {item.isDefault ? (
                  <Badge className='bg-emerald-500/10 text-emerald-700'>
                    Default
                  </Badge>
                ) : (
                  '—'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Settings({
  activation,
  busy,
  onSave,
  onRemove,
}: {
  readonly activation: ActivationPolicy;
  readonly busy: boolean;
  readonly onSave: (activation: ActivationPolicy) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const [value, setValue] = useState<ActivationPolicy>(activation);
  return (
    <div className='max-w-3xl space-y-5'>
      <div>
        <h2 className='font-semibold'>Application settings</h2>
        <p className='mt-1 text-sm leading-6 text-muted-foreground'>
          Choose how this application is activated after Hub starts. This is an
          application setting and is not changed by deployments.
        </p>
      </div>
      <form
        className='space-y-6'
        onSubmit={(event) => {
          event.preventDefault();
          onSave(value);
        }}
      >
        <div className='grid gap-2'>
          <label className='text-sm font-medium'>Startup</label>
          <p className='text-xs leading-5 text-muted-foreground'>
            Controls whether the application starts with Hub or waits for its
            first visit.
          </p>
          <RadioGroup
            className='mt-2 grid gap-4'
            disabled={busy}
            onValueChange={(next) => setValue(next as ActivationPolicy)}
            value={value}
          >
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${value === 'eager' ? 'border-primary bg-primary/5' : ''}`}
            >
              <RadioGroupItem className='mt-0.5' value='eager' />
              <span>
                <span className='block text-sm font-medium'>
                  Start with Hub
                </span>
                <span className='mt-1 block text-xs leading-5 text-muted-foreground'>
                  Start automatically after Hub starts and report Running when
                  activation completes.
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${value === 'lazy' ? 'border-primary bg-primary/5' : ''}`}
            >
              <RadioGroupItem className='mt-0.5' value='lazy' />
              <span>
                <span className='block text-sm font-medium'>
                  Start on first visit
                </span>
                <span className='mt-1 block text-xs leading-5 text-muted-foreground'>
                  Register the route after Hub starts, remain Ready, and
                  activate when the application is first visited.
                </span>
              </span>
            </label>
          </RadioGroup>
        </div>
        <div className='flex justify-end border-t pt-5'>
          <Button disabled={busy || value === activation} type='submit'>
            {busy ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>
      <div className='border-t pt-6'>
        <h3 className='text-sm font-semibold text-destructive'>Danger zone</h3>
        <p className='mt-1 text-sm text-muted-foreground'>
          Permanently remove the application, its releases, configuration, and
          application data from this Hub.
        </p>
        <Button
          className='mt-4 border-destructive/40 text-destructive hover:bg-destructive/10'
          disabled={busy}
          onClick={onRemove}
          variant='outline'
        >
          <Trash2 className='size-4' /> Remove application
        </Button>
      </div>
    </div>
  );
}

function RemoveApplicationDialog({
  app,
  busy,
  onClose,
  onRemove,
}: {
  readonly app: AppDetail;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onRemove: () => void;
}): ReactElement {
  return (
    <UiDialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className='max-w-[30rem] overflow-hidden p-0'>
        <DialogHeader className='mb-0 px-6 pt-6 pr-14'>
          <div className='flex items-start gap-3.5'>
            <span className='grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive'>
              <Trash2 className='size-5' />
            </span>
            <div className='min-w-0 pt-0.5'>
              <DialogTitle>Remove application?</DialogTitle>
              <DialogDescription className='mt-1.5 leading-6'>
                <span className='font-medium text-foreground'>
                  {app.app.name}
                </span>{' '}
                and all of its releases, configuration, and application data
                will be permanently deleted.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className='px-6 py-5'>
          <div className='flex items-center gap-2.5 rounded-lg bg-destructive/5 px-3.5 py-3 text-sm text-destructive'>
            <TriangleAlert className='size-4 shrink-0' />
            <span>This action cannot be undone.</span>
          </div>
        </div>
        <div className='flex justify-end gap-2 border-t bg-muted/30 px-6 py-4'>
          <Button
            className='cursor-pointer'
            disabled={busy}
            onClick={onClose}
            variant='outline'
          >
            Cancel
          </Button>
          <Button
            className='min-w-20 cursor-pointer bg-destructive text-white hover:bg-destructive/90'
            disabled={busy}
            onClick={onRemove}
            variant='destructive'
          >
            {busy ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </DialogContent>
    </UiDialog>
  );
}

function Development({ appId }: { readonly appId: string }): ReactElement {
  const [copied, setCopied] = useState(false);
  const command = `npm_config_registry=https://npm.nocobase.ai pnpm create @nocobase/app ${appId}`;
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className='mx-auto max-w-3xl py-4'>
      <div className='mb-6 flex items-start gap-4'>
        <span className='grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary'>
          <Code2 className='size-5' />
        </span>
        <div>
          <h2 className='text-lg font-semibold'>Develop this application</h2>
          <p className='mt-1 text-sm leading-6 text-muted-foreground'>
            Create a local NocoBase project using this application ID, then
            build and upload its release from the Deploy flow.
          </p>
        </div>
      </div>
      <Card className='overflow-hidden'>
        <CardHeader className='border-b bg-muted/20'>
          <p className='text-sm font-medium'>Create a new application</p>
          <p className='mt-1 text-xs text-muted-foreground'>
            Run this command in the directory where you keep source projects.
          </p>
        </CardHeader>
        <CardContent className='p-0'>
          <div className='flex items-center gap-3 bg-slate-950 px-4 py-4 text-slate-100'>
            <span className='select-none text-slate-500'>$</span>
            <code className='min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs sm:text-sm'>
              {command}
            </code>
            <Button
              aria-label='Copy create-app command'
              className='border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
              onClick={() => void copy()}
              size='icon'
              variant='outline'
            >
              {copied ? <ClipboardCheck /> : <Clipboard />}
            </Button>
          </div>
        </CardContent>
        <CardFooter className='block bg-muted/20 text-xs leading-5 text-muted-foreground'>
          The command creates the source project locally. When it is ready,
          return here and choose{' '}
          <span className='font-medium text-foreground'>Deploy</span> to upload
          the first release.
        </CardFooter>
      </Card>
    </div>
  );
}

function Configuration({
  mode,
  content,
  busy,
  onSave,
}: {
  readonly mode: ConfigMode;
  readonly content: string;
  readonly busy: boolean;
  readonly onSave: (content: string) => void;
}): ReactElement {
  const source = CONFIG_MODES.find((item) => item.value === mode);
  const [draft, setDraft] = useState(content);
  const [reviewOpen, setReviewOpen] = useState(false);
  const validationError = validateConfigDocument(draft);
  const changed = draft !== content;
  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='font-semibold'>Configuration</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Configuration source used by this application.
          </p>
        </div>
        <Badge className='gap-1.5 bg-muted text-foreground [&_svg]:size-3.5'>
          {source?.icon} {source?.title ?? mode}
        </Badge>
      </div>
      {mode === 'file' ? (
        <div className='space-y-4'>
          <div className='overflow-hidden rounded-xl border'>
            <div className='border-b bg-muted/20 px-4 py-3'>
              <span className='flex items-center gap-2 text-sm font-medium'>
                <FileCode2 className='size-4' /> config.yml
              </span>
            </div>
            <Suspense fallback={<ConfigEditorFallback />}>
              <ConfigEditor value={draft} onChange={setDraft} />
            </Suspense>
          </div>
          <ConfigStatus
            error={validationError}
            summary={summarizeConfigChanges('file', 'file', content, draft)}
          />
          <ConfigReloadNotice />
          <div className='flex justify-end'>
            <Button
              disabled={busy || !changed || validationError !== null}
              onClick={() => setReviewOpen(true)}
            >
              {busy ? 'Publishing…' : 'Save and publish'}
            </Button>
          </div>
        </div>
      ) : null}
      {mode === 'external' ? (
        <Alert className='bg-muted/20'>
          <ExternalLink />
          <AlertDescription>
            Configuration and secrets are supplied by the runtime environment.
            Hub does not create, mount, or edit a configuration file for this
            deployment.
          </AlertDescription>
        </Alert>
      ) : null}
      {reviewOpen ? (
        <AppDialog
          wide
          title='Review configuration changes'
          description='Review the current and new configuration before publishing. This reloads configuration without restarting the application.'
          onClose={() => setReviewOpen(false)}
        >
          <ConfigChangesReview
            current={content}
            value={draft}
            baselineMode={mode}
            validationError={validationError}
            expanded
          />
          <div className='mt-4'>
            <ConfigReloadNotice />
          </div>
          <div className='mt-7 flex justify-between gap-2'>
            <Button variant='outline' onClick={() => setReviewOpen(false)}>
              Back
            </Button>
            <Button
              disabled={busy || !changed || validationError !== null}
              onClick={() => {
                setReviewOpen(false);
                onSave(draft);
              }}
            >
              Save and publish
            </Button>
          </div>
        </AppDialog>
      ) : null}
    </div>
  );
}

function ConfigReloadNotice(): ReactElement {
  return (
    <Alert>
      <Info />
      <AlertDescription>
        Configuration reload does not restart the application. Services that
        support live updates apply changes immediately. Other changes take
        effect after the application restarts. Stopped applications load the
        configuration on next start.
      </AlertDescription>
    </Alert>
  );
}

function ConfigChangesReview({
  current,
  value,
  baselineMode,
  validationError,
  expanded = false,
}: {
  readonly current: string;
  readonly value: string;
  readonly baselineMode: ConfigMode;
  readonly validationError: string | null;
  readonly expanded?: boolean;
}): ReactElement {
  return (
    <div className='space-y-4'>
      <ConfigStatus
        error={validationError}
        summary={summarizeConfigChanges(baselineMode, 'file', current, value)}
      />
      <details className='overflow-hidden rounded-lg border' open={expanded}>
        <summary className='cursor-pointer bg-muted/20 px-3 py-2 text-sm font-medium'>
          Review configuration changes
        </summary>
        <Suspense fallback={<ConfigEditorFallback />}>
          <ConfigUnifiedDiff
            current={baselineMode === 'file' ? current : ''}
            value={value}
          />
        </Suspense>
      </details>
    </div>
  );
}

function DeploymentDialog({
  app,
  releaseId,
  mode,
  content,
  baselineContent,
  baselineMode,
  rollback,
  busy,
  onRelease,
  loadTemplate,
  onMode,
  onContent,
  onClose,
  onComplete,
}: {
  readonly app: AppDetail;
  readonly releaseId: string | undefined;
  readonly mode: ConfigMode;
  readonly content: string;
  readonly baselineContent: string;
  readonly baselineMode: ConfigMode;
  readonly rollback: boolean;
  readonly busy: boolean;
  readonly onRelease: (releaseId: string) => void;
  readonly loadTemplate: (
    appId: string,
    releaseId: string,
  ) => Promise<string | null>;
  readonly onMode: (mode: ConfigMode) => void;
  readonly onContent: (content: string) => void;
  readonly onClose: () => void;
  readonly onComplete: () => void;
}): ReactElement {
  const firstStep = rollback ? 1 : 0;
  const [step, setStep] = useState(firstStep);
  const [retry, setRetry] = useState(0);
  const [templateError, setTemplateError] = useState<string>();
  const [loadedReleaseId, setLoadedReleaseId] = useState<string>();
  const editingConfig = step > 0;
  const configReady = loadedReleaseId === releaseId && releaseId !== undefined;
  useEffect(() => {
    if (!editingConfig || !releaseId || loadedReleaseId === releaseId) return;
    let cancelled = false;
    void loadTemplate(app.app.id, releaseId)
      .then((template) => {
        if (cancelled) return;
        onContent(template ?? (baselineMode === 'file' ? baselineContent : ''));
        if (!rollback) onMode(template !== null ? 'file' : baselineMode);
        setLoadedReleaseId(releaseId);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setTemplateError(readError(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [
    editingConfig,
    releaseId,
    loadedReleaseId,
    retry,
    loadTemplate,
    app.app.id,
    baselineMode,
    baselineContent,
    rollback,
    onContent,
    onMode,
  ]);
  const [visibleConfig, setVisibleConfig] = useState<
    'both' | 'current' | 'new'
  >('both');
  const release = app.releases.find((item) => item.id === releaseId);
  const validationError =
    mode === 'file' ? validateConfigDocument(content) : null;
  const summary = summarizeConfigChanges(
    baselineMode,
    mode,
    baselineContent,
    content,
  );
  return (
    <AppDialog
      title={rollback ? 'Roll back application' : 'Deploy application'}
      description={app.app.name}
      onClose={onClose}
      wide
    >
      <DeploymentSteps current={step} rollback={rollback} />
      <div>
        {step === 0 ? (
          <div className='max-h-[22rem] overflow-y-auto rounded-xl border'>
            {app.releases.map((item) => (
              <Button
                className={`grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] justify-stretch rounded-none border-b px-4 py-3 text-left last:border-0 ${releaseId === item.id ? 'bg-primary/5' : ''}`}
                disabled={busy}
                key={item.id}
                onClick={() => {
                  if (item.id !== releaseId) {
                    setLoadedReleaseId(undefined);
                    setTemplateError(undefined);
                  }
                  onRelease(item.id);
                }}
                variant='ghost'
              >
                <span className='flex items-center gap-3'>
                  <span
                    className={`grid size-4 shrink-0 place-items-center rounded-full border ${releaseId === item.id ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}
                  >
                    {releaseId === item.id ? (
                      <Check className='size-3' />
                    ) : null}
                  </span>
                  <span>
                    <span className='block text-sm font-medium'>
                      v{item.version}
                    </span>
                    <span className='font-mono text-[11px] text-muted-foreground'>
                      {item.checksum.slice(0, 12)}
                    </span>
                  </span>
                </span>
                <span className='text-xs text-muted-foreground'>
                  {formatDate(item.createdAt)}
                </span>
              </Button>
            ))}
          </div>
        ) : !configReady ? (
          <div className='min-h-80 py-6'>
            {templateError ? (
              <Alert className='border-destructive/30 text-destructive'>
                <AlertCircle />
                <AlertDescription>
                  <p>Failed to load configuration template: {templateError}</p>
                  <Button
                    variant='outline'
                    onClick={() => {
                      setTemplateError(undefined);
                      setRetry((value) => value + 1);
                    }}
                  >
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <div
                role='status'
                className='flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground'
              >
                <LoaderCircle className='size-4 animate-spin' />
                Loading configuration template…
              </div>
            )}
          </div>
        ) : step === 1 ? (
          <div className='space-y-5'>
            {rollback ? (
              <div className='flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 text-sm'>
                <span className='text-muted-foreground'>Release</span>
                <span className='font-medium'>
                  {release ? `v${release.version}` : '—'}
                </span>
              </div>
            ) : null}
            {rollback ? (
              <div className='flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 text-sm'>
                <span className='text-muted-foreground'>
                  Configuration source
                </span>
                <span className='font-medium'>{configModeLabel(mode)}</span>
              </div>
            ) : (
              <ConfigModePicker value={mode} onChange={onMode} />
            )}
            {mode === 'file' ? (
              <div className='space-y-3'>
                {release?.hasConfigTemplate ? (
                  <Alert className='border-blue-500/25 bg-blue-500/5'>
                    <Info className='size-4 shrink-0 text-blue-600' />
                    <AlertDescription>
                      The Release template contains example configuration. If
                      you use it, replace example values, credentials, and
                      secrets with deployment-ready values.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div>
                  <div className='overflow-hidden rounded-xl border'>
                    <div className='flex flex-wrap items-end justify-between gap-3 border-b bg-muted/20 px-4 pt-3'>
                      <div className='pb-3'>
                        <div className='flex items-center gap-2 text-sm font-medium'>
                          <FileCode2 className='size-4 text-primary' />
                          Deployment configuration
                        </div>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          Edit the configuration that will be used for this
                          deployment.
                        </p>
                      </div>
                      <div className='pb-3'>
                        <div
                          role='group'
                          aria-label='Configuration layout'
                          className='inline-flex items-center gap-0.5 rounded-lg border bg-muted/30 p-0.5'
                        >
                          {(
                            [
                              [
                                'current',
                                'Current configuration only',
                                PanelLeft,
                              ],
                              ['both', 'Side by side', Columns2],
                              ['new', 'New configuration only', PanelRight],
                            ] as const
                          ).map(([value, label, Icon]) => (
                            <Button
                              key={value}
                              size='icon'
                              variant='ghost'
                              className={`size-7 rounded-md ${visibleConfig === value ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}
                              aria-label={label}
                              aria-pressed={visibleConfig === value}
                              title={label}
                              onClick={() => setVisibleConfig(value)}
                            >
                              <Icon className='size-4' />
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div
                        className={`grid ${visibleConfig === 'both' ? 'grid-cols-2 divide-x' : 'grid-cols-1'} border-b bg-muted/20`}
                      >
                        <div
                          hidden={visibleConfig === 'new'}
                          className='px-4 py-2.5'
                        >
                          <p className='text-xs font-medium'>Current</p>
                          <p className='mt-0.5 text-xs text-muted-foreground'>
                            {app.app.currentDeploymentId
                              ? `Deployment ${shortId(app.app.currentDeploymentId)} · Read-only`
                              : 'No active configuration'}
                          </p>
                        </div>
                        <div
                          hidden={visibleConfig === 'current'}
                          className='px-4 py-2.5'
                        >
                          <p className='text-xs font-medium'>
                            New configuration
                          </p>
                          <p className='mt-0.5 text-xs text-muted-foreground'>
                            {release?.hasConfigTemplate
                              ? `From Release v${release.version} template · Editable`
                              : baselineMode === 'file' &&
                                  app.app.currentDeploymentId
                                ? 'From current configuration · Editable'
                                : 'No Release template · Editable'}
                          </p>
                        </div>
                      </div>
                      <Suspense fallback={<ConfigEditorFallback />}>
                        <ConfigMergeEditor
                          current={
                            baselineMode === 'file' ? baselineContent : ''
                          }
                          onChange={onContent}
                          value={content}
                          visiblePane={visibleConfig}
                        />
                      </Suspense>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {mode === 'external' ? (
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='rounded-xl border bg-muted/20 px-4 py-3'>
                  <p className='text-xs text-muted-foreground'>
                    Current configuration
                  </p>
                  <p className='mt-1 text-sm font-medium'>
                    {app.app.currentDeploymentId
                      ? configModeLabel(baselineMode)
                      : 'No active configuration'}
                  </p>
                </div>
                <div className='rounded-xl border border-primary/30 bg-primary/5 px-4 py-3'>
                  <p className='text-xs text-muted-foreground'>
                    New configuration
                  </p>
                  <p className='mt-1 text-sm font-medium'>External</p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Runtime configuration and secrets are supplied outside Hub.
                  </p>
                </div>
              </div>
            ) : null}
            {mode === 'file' ? (
              <ConfigStatus error={validationError} summary={summary} />
            ) : null}
            {mode === 'file' ? (
              <Alert className='border-amber-500/30 bg-amber-500/5 text-amber-800'>
                <TriangleAlert className='size-4 shrink-0' />
                <AlertDescription className='text-amber-800'>
                  config.yml may contain secrets. Hub stores the complete file
                  for this application, and authorized administrators can view
                  its contents.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : (
          <div className='overflow-hidden rounded-xl border'>
            <div className='grid grid-cols-[9rem_minmax(0,1fr)] gap-4 border-b px-4 py-3 text-sm'>
              <span className='text-muted-foreground'>Application</span>
              <span className='font-medium'>{app.app.name}</span>
            </div>
            <div className='grid grid-cols-[9rem_minmax(0,1fr)] gap-4 border-b px-4 py-3 text-sm'>
              <span className='text-muted-foreground'>Release</span>
              <span className='font-medium'>
                {release ? `v${release.version}` : '—'}
              </span>
            </div>
            <div className='grid grid-cols-[9rem_minmax(0,1fr)] gap-4 border-b px-4 py-3 text-sm'>
              <span className='text-muted-foreground'>Configuration</span>
              <span className='font-medium'>
                {mode === 'file' ? 'Config file' : 'External'}
              </span>
            </div>
            {mode === 'file' ? (
              <div className='space-y-4 p-4'>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div className='rounded-lg border bg-muted/20 px-3 py-2.5'>
                    <p className='text-xs text-muted-foreground'>
                      Current configuration
                    </p>
                    <p className='mt-1 text-sm font-medium'>
                      {app.app.currentDeploymentId
                        ? `${configModeLabel(baselineMode)} · Deployment ${shortId(app.app.currentDeploymentId)}`
                        : 'No active configuration'}
                    </p>
                  </div>
                  <div className='rounded-lg border bg-primary/5 px-3 py-2.5'>
                    <p className='text-xs text-muted-foreground'>
                      New configuration
                    </p>
                    <p className='mt-1 text-sm font-medium'>
                      {`Config file · Release v${release?.version ?? '—'}`}
                    </p>
                  </div>
                </div>
                <ConfigChangesReview
                  current={baselineContent}
                  value={content}
                  baselineMode={baselineMode}
                  validationError={validationError}
                />
              </div>
            ) : (
              <div className='p-4'>
                <div className='flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-700'>
                  <Check className='size-4 shrink-0' />
                  {summary.sourceChanged
                    ? `Configuration source changes from ${configModeLabel(baselineMode)} to External`
                    : 'No configuration source changes'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className='mt-7 flex justify-between gap-2'>
        <Button
          onClick={step === firstStep ? onClose : () => setStep(step - 1)}
          variant='outline'
        >
          {step === firstStep ? 'Cancel' : 'Back'}
        </Button>
        {step < 2 ? (
          <Button
            disabled={
              !release ||
              busy ||
              (step === 1 &&
                (!configReady ||
                  mode === 'managed' ||
                  validationError !== null))
            }
            onClick={() => {
              setTemplateError(undefined);
              setStep(step + 1);
            }}
          >
            Continue <ChevronRight />
          </Button>
        ) : (
          <Button
            disabled={
              busy ||
              !release ||
              !configReady ||
              mode === 'managed' ||
              validationError !== null
            }
            onClick={onComplete}
          >
            {busy
              ? rollback
                ? 'Rolling back…'
                : 'Deploying…'
              : rollback
                ? 'Roll back'
                : 'Deploy'}
          </Button>
        )}
      </div>
    </AppDialog>
  );
}

interface ConfigChangeSummary {
  readonly added: number;
  readonly removed: number;
  readonly sourceChanged: boolean;
  readonly unchanged: boolean;
}

function summarizeConfigChanges(
  beforeMode: ConfigMode,
  afterMode: ConfigMode,
  before: string,
  after: string,
): ConfigChangeSummary {
  const lines = diffLines(before, after);
  return {
    added: lines.filter((line) => line.kind === 'added').length,
    removed: lines.filter((line) => line.kind === 'removed').length,
    sourceChanged: beforeMode !== afterMode,
    unchanged: beforeMode === afterMode && before === after,
  };
}

function ConfigStatus({
  error,
  summary,
}: {
  readonly error: string | null;
  readonly summary: ConfigChangeSummary;
}): ReactElement {
  if (error) {
    return (
      <div className='flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive'>
        <AlertCircle className='mt-0.5 size-4 shrink-0' />
        <span>{error}</span>
      </div>
    );
  }
  return (
    <div className='flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-700'>
      <Check className='size-4 shrink-0' />
      <span>
        {summary.unchanged
          ? 'Valid YAML · No configuration changes'
          : summary.sourceChanged
            ? `Valid YAML · Configuration source changed · ${summary.added} added and ${summary.removed} removed lines`
            : `Valid YAML · ${summary.added} added and ${summary.removed} removed lines`}
      </span>
    </div>
  );
}

function ConfigEditorFallback(): ReactElement {
  return (
    <div
      className='h-[360px] animate-pulse bg-muted/30'
      aria-label='Loading editor'
    />
  );
}

function validateConfigDocument(content: string): string | null {
  try {
    const value: unknown = content.trim() === '' ? {} : parseYaml(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return 'The YAML root must be an object.';
    }
    return null;
  } catch (error) {
    return `Invalid config.yml: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function shortId(value: string): string {
  return `#${value.slice(0, 8)}`;
}

function configModeLabel(mode: ConfigMode): string {
  return mode === 'file'
    ? 'Config file'
    : mode === 'external'
      ? 'External'
      : 'Hub managed';
}

type DiffLine = {
  readonly id: string;
  readonly kind: 'unchanged' | 'added' | 'removed';
  readonly value: string;
};

function diffLines(before: string, after: string): readonly DiffLine[] {
  const left = before.split('\n');
  const right = after.split('\n');
  if (left.length * right.length > 250_000) {
    return diffLinesByPosition(left, right);
  }
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        left[i] === right[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      result.push({
        id: String(result.length),
        kind: 'unchanged',
        value: left[i],
      });
      i += 1;
      j += 1;
    } else if (
      j < right.length &&
      (i === left.length || lengths[i][j + 1] >= lengths[i + 1][j])
    ) {
      result.push({
        id: String(result.length),
        kind: 'added',
        value: right[j],
      });
      j += 1;
    } else {
      result.push({
        id: String(result.length),
        kind: 'removed',
        value: left[i],
      });
      i += 1;
    }
  }
  return result;
}

function diffLinesByPosition(
  left: readonly string[],
  right: readonly string[],
): readonly DiffLine[] {
  const result: DiffLine[] = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === right[index]) {
      result.push({
        id: String(result.length),
        kind: 'unchanged',
        value: left[index] ?? '',
      });
      continue;
    }
    if (left[index] !== undefined) {
      result.push({
        id: String(result.length),
        kind: 'removed',
        value: left[index],
      });
    }
    if (right[index] !== undefined) {
      result.push({
        id: String(result.length),
        kind: 'added',
        value: right[index],
      });
    }
  }
  return result;
}

function UploadReleaseDialog({
  artifact,
  busy,
  onArtifact,
  onClose,
  onUpload,
}: {
  readonly artifact: File | undefined;
  readonly busy: boolean;
  readonly onArtifact: (file: File | undefined) => void;
  readonly onClose: () => void;
  readonly onUpload: () => void;
}): ReactElement {
  return (
    <AppDialog
      title='Upload release'
      description='Upload a built application artifact. Version and config.example.yml or config.example.yaml are detected automatically.'
      onClose={onClose}
    >
      <Button
        className='h-auto min-h-28 w-full flex-col gap-2 border-dashed'
        render={<label className='cursor-pointer' />}
        variant='outline'
      >
        <CloudUpload className='size-5' />
        <span>{artifact?.name ?? 'Choose a .tar.gz release artifact'}</span>
        <Input
          accept='.gz,.tgz,application/gzip'
          className='sr-only'
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onArtifact(event.target.files?.[0])
          }
          type='file'
        />
      </Button>
      <div className='mt-6 flex justify-end gap-2'>
        <Button onClick={onClose} variant='outline'>
          Cancel
        </Button>
        <Button disabled={!artifact || busy} onClick={onUpload}>
          {busy ? 'Uploading…' : 'Upload release'}
        </Button>
      </div>
    </AppDialog>
  );
}

function ConfigModePicker({
  value,
  onChange,
}: {
  readonly value: ConfigMode;
  readonly onChange: (mode: ConfigMode) => void;
}): ReactElement {
  const selected = CONFIG_MODES.find((item) => item.value === value);
  return (
    <div>
      <div className='grid gap-2 sm:grid-cols-3'>
        {CONFIG_MODES.map((item) => (
          <Button
            className={`relative h-11 justify-start px-3 ${value === item.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
            disabled={item.disabled}
            key={item.value}
            onClick={() => onChange(item.value)}
            variant='outline'
          >
            <span className='text-muted-foreground [&_svg]:size-4'>
              {item.icon}
            </span>
            <span>{item.title}</span>
            {item.disabled ? <Badge className='text-[9px]'>Soon</Badge> : null}
            {value === item.value ? (
              <Check className='absolute right-3 size-3.5 text-primary' />
            ) : null}
          </Button>
        ))}
      </div>
      <p className='mt-2 text-xs text-muted-foreground'>
        {selected?.description}
      </p>
    </div>
  );
}

function DeploymentSteps({
  current,
  rollback,
}: {
  readonly current: number;
  readonly rollback: boolean;
}): ReactElement {
  const steps = rollback
    ? [
        { index: 1, label: 'Configuration' },
        { index: 2, label: 'Review' },
      ]
    : [
        { index: 0, label: 'Release' },
        { index: 1, label: 'Configuration' },
        { index: 2, label: 'Review' },
      ];
  return (
    <ol className='mb-6 flex items-center' aria-label='Deployment progress'>
      {steps.map((item, position) => {
        const active = item.index === current;
        const complete = item.index < current;
        return (
          <li className='contents' key={item.label}>
            {position > 0 ? (
              <span
                className={`mx-3 h-px min-w-6 flex-1 ${complete || active ? 'bg-primary/50' : 'bg-border'}`}
              />
            ) : null}
            <span
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-2 text-sm font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              <span
                className={`grid size-6 place-items-center rounded-full border text-xs ${active ? 'border-primary bg-primary text-primary-foreground' : complete ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-background'}`}
              >
                {complete ? <Check className='size-3.5' /> : position + 1}
              </span>
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
function CreateDialog({
  busy,
  appId,
  name,
  onAppId,
  onName,
  onClose,
  onCreate,
}: {
  readonly busy: boolean;
  readonly appId: string;
  readonly name: string;
  readonly onAppId: (value: string) => void;
  readonly onName: (value: string) => void;
  readonly onClose: () => void;
  readonly onCreate: () => void;
}): ReactElement {
  return (
    <AppDialog
      title='Create application'
      description='Create a stable identity before deploying a release.'
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <Field label='Application name'>
          <Input
            autoFocus
            className='h-10'
            onChange={(event) => onName(event.target.value)}
            placeholder='Customer portal'
            required
            value={name}
          />
        </Field>
        <Field
          label='Application ID'
          hint='Used in URLs and storage. It cannot be changed later.'
        >
          <Input
            className='h-10 font-mono'
            onChange={(event) => onAppId(event.target.value)}
            pattern='[A-Za-z0-9_-]+'
            placeholder='customer-portal'
            required
            value={appId}
          />
        </Field>
        <div className='mt-6 flex justify-end gap-2'>
          <Button onClick={onClose} variant='outline'>
            Cancel
          </Button>
          <Button disabled={busy} type='submit'>
            Create application
          </Button>
        </div>
      </form>
    </AppDialog>
  );
}
function AppDialog({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly wide?: boolean;
}): ReactElement {
  return (
    <UiDialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        className={wide ? 'max-w-none p-8' : 'max-w-xl p-8'}
        style={wide ? { width: 'min(72rem, calc(100vw - 2rem))' } : undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </UiDialog>
  );
}

function ErrorBanner({
  message,
  onClose,
}: {
  readonly message: string;
  readonly onClose?: () => void;
}): ReactElement {
  return (
    <Alert className='mb-5 border-destructive/30 bg-destructive/5 text-destructive'>
      <AlertCircle className='size-4 shrink-0' />
      <AlertDescription className='text-destructive'>
        {message}
      </AlertDescription>
      {onClose ? (
        <Button
          aria-label='Dismiss error'
          className='absolute top-1 right-1'
          onClick={onClose}
          size='icon'
          variant='ghost'
        >
          <X className='size-4' />
        </Button>
      ) : null}
    </Alert>
  );
}
function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <label className='mb-4 block text-sm font-medium'>
      {label}
      <span className='mt-2 block'>{children}</span>
      {hint ? (
        <span className='mt-1.5 block text-xs font-normal text-muted-foreground'>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
function Empty({
  icon,
  title,
  description,
  action,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <ShadcnEmpty className='bg-card'>
      <EmptyMedia>{icon}</EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </ShadcnEmpty>
  );
}
function ViewButton({
  active,
  label,
  onClick,
  icon,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly icon: ReactNode;
}): ReactElement {
  return (
    <Button
      aria-label={label}
      onClick={onClick}
      className={active ? 'size-8 bg-muted' : 'size-8 text-muted-foreground'}
      size='icon'
      variant='ghost'
    >
      {icon}
    </Button>
  );
}
function AppMark({
  name,
  small = false,
}: {
  readonly name: string;
  readonly small?: boolean;
}): ReactElement {
  return (
    <Avatar className={small ? 'size-9' : 'size-12'}>
      <AvatarFallback className='bg-primary/10 font-semibold text-primary'>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
function StatusBadge({ state }: { readonly state: string }): ReactElement {
  const style =
    state === 'running'
      ? 'bg-emerald-500/10 text-emerald-700'
      : state === 'failed'
        ? 'bg-destructive/10 text-destructive'
        : state === 'pending' || state === 'queued' || state === 'deploying'
          ? 'bg-amber-500/10 text-amber-700'
          : state === 'succeeded'
            ? 'bg-emerald-500/10 text-emerald-700'
            : state === 'stopped'
              ? 'bg-sky-500/10 text-sky-700'
              : 'bg-muted text-muted-foreground';
  return (
    <Badge className={`self-center gap-1.5 whitespace-nowrap ${style}`}>
      <span
        className={`size-1.5 rounded-full ${state === 'running' || state === 'succeeded' ? 'bg-emerald-500' : state === 'failed' ? 'bg-destructive' : state === 'pending' || state === 'queued' || state === 'deploying' ? 'bg-amber-500' : state === 'stopped' ? 'bg-sky-500' : 'bg-neutral-400'}`}
      />
      {stateLabel(state)}
    </Badge>
  );
}
function applicationUrl(app: AppDetail): string | null {
  if (!app.hostUrl || !hasDeployment(app)) return null;
  try {
    return new URL(
      app.deployment.basePath.replace(/^\//u, ''),
      ensureSlash(app.hostUrl),
    ).toString();
  } catch {
    return null;
  }
}
function hasDeployment(app: AppDetail): boolean {
  return (
    app.deployment.desiredReleaseId !== null ||
    app.deployment.observedReleaseId !== null
  );
}
function ensureSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
async function uploadArtifact(
  appId: string,
  artifact: File,
): Promise<ReleaseRecord> {
  const response = await fetch(
    resolveAppUrl(`/api/hub/apps/${appId}/releases`),
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/gzip',
      },
      body: artifact,
    },
  );
  if (!response.ok) throw new Error(await response.text());
  const result = (await response.json()) as ApiResponse<ReleaseRecord>;
  return result.data;
}
function initials(value: string): string {
  return value
    .split(/\s+/u)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
function stateLabel(value: string): string {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : 'Unknown';
}
function deploymentPhaseLabel(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    resolving: 'Preparing release',
    verifying: 'Verifying release',
    extracting: 'Extracting files',
    preparing: 'Preparing application',
    starting: 'Starting application',
    health_check: 'Checking application health',
    switching: 'Activating release',
    cleaning: 'Cleaning up',
  };
  return labels[value] ?? stateLabel(value.replaceAll('_', ' '));
}
function resourceGroups(
  content: string,
): Readonly<Record<ResourceKind, readonly ResourceSummary[]>> {
  let root: Record<string, unknown> = {};
  try {
    const parsed: unknown = content.trim() ? parseYaml(content) : {};
    if (isClientRecord(parsed)) root = parsed;
  } catch {
    return { databases: [], drives: [], caching: [], llm: [] };
  }
  const database = childRecord(root, 'database');
  const drive = childRecord(root, 'drive');
  const caching = childRecord(root, 'caching');
  const llm = childRecord(root, 'llm');
  return {
    databases: summarizeResources(
      childRecord(database, 'connections'),
      scalarString(database.default),
      'dialect',
      [
        'database',
        'filename',
        'host',
        'port',
        'schema',
        'charset',
        'timezone',
        'socketPath',
        'debug',
        'managed',
      ],
    ),
    drives: summarizeResources(
      childRecord(drive, 'disks'),
      scalarString(drive.default),
      'driver',
      [
        'location',
        'bucket',
        'region',
        'endpoint',
        'url',
        'cdnUrl',
        'visibility',
        'encryption',
        'forcePathStyle',
        'supportsACL',
      ],
    ),
    caching: summarizeResources(
      childRecord(caching, 'providers'),
      scalarString(caching.default),
      'driver',
      ['defaultTtl', 'maxTtl', 'maxSize', 'checkInterval', 'useClone'],
    ),
    llm: summarizeResources(
      childRecord(llm, 'services'),
      scalarString(llm.default),
      'provider',
      ['model', 'baseURL'],
    ),
  };
}
function summarizeResources(
  values: Record<string, unknown>,
  defaultKey: string | undefined,
  typeKey: 'dialect' | 'driver' | 'provider',
  detailKeys: readonly string[],
): readonly ResourceSummary[] {
  return Object.entries(values)
    .map(([key, value]) => {
      const settings = isClientRecord(value) ? value : {};
      return {
        key,
        type:
          scalarString(settings[typeKey]) ??
          scalarString(settings.driver) ??
          'Configured',
        isDefault: key === defaultKey,
        details: detailKeys.flatMap((detailKey) => {
          const detailValue = displayResourceValue(
            detailKey,
            settings[detailKey],
          );
          return detailValue === undefined
            ? []
            : [{ label: formatResourceField(detailKey), value: detailValue }];
        }),
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}
function childRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const child = value[key];
  return isClientRecord(child) ? child : {};
}
function isClientRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function scalarString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
function displayScalar(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string => typeof item === 'string' && Boolean(item),
    );
    return items.length ? items.join(', ') : undefined;
  }
  return undefined;
}
function displayResourceValue(key: string, value: unknown): string | undefined {
  const displayed = displayScalar(value);
  if (displayed === undefined) return undefined;
  if (!['baseURL', 'cdnUrl', 'endpoint', 'url'].includes(key)) return displayed;
  try {
    const parsed = new URL(displayed);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return displayed.includes('@') || displayed.includes('?')
      ? undefined
      : displayed;
  }
}
function formatResourceField(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    baseURL: 'Base URL',
    cdnUrl: 'CDN URL',
    checkInterval: 'Check interval',
    defaultTtl: 'Default TTL',
    forcePathStyle: 'Path style',
    maxSize: 'Max size',
    maxTtl: 'Max TTL',
    socketPath: 'Socket',
    supportsACL: 'ACL support',
    useClone: 'Clone values',
  };
  return labels[value] ?? `${value[0]?.toUpperCase()}${value.slice(1)}`;
}
function resourceLabel(kind: ResourceKind): string {
  if (kind === 'databases') return 'database connections';
  if (kind === 'drives') return 'drives';
  if (kind === 'caching') return 'cache providers';
  return 'LLM services';
}
function resourceDescription(kind: ResourceKind): string {
  if (kind === 'databases') {
    return 'Database connections discovered by key from database.connections.';
  }
  if (kind === 'drives') {
    return 'Storage disks discovered by key from drive.disks.';
  }
  if (kind === 'caching') {
    return 'Cache providers discovered by key from caching.providers.';
  }
  return 'Language model services available to this application.';
}
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) || date.valueOf() <= 0
    ? '—'
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
}
function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) || date.valueOf() <= 0
    ? '—'
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
}
function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function readError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Boxes,
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
  List,
  LoaderCircle,
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
import { Textarea } from '../components/ui/textarea.js';
import {
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

interface ReleaseRecord {
  readonly id: string;
  readonly version: string;
  readonly size: number;
  readonly checksum: string;
  readonly configTemplate: string | null;
  readonly createdAt: string;
}
interface DeploymentRecord {
  readonly id: string;
  readonly releaseId: string;
  readonly kind: 'deploy' | 'rollback';
  readonly status:
    'queued' | 'deploying' | 'succeeded' | 'failed' | 'cancelled';
  readonly phase: string;
  readonly cacheHit: boolean | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}
interface AppDetail {
  readonly app: {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly currentDeploymentId: string | null;
  };
  readonly deployments: readonly DeploymentRecord[];
  readonly runtime: {
    readonly hostAvailable: boolean;
    readonly state: string;
    readonly error: string | null;
  };
  readonly deployment: {
    readonly desiredReleaseId: string | null;
    readonly observedReleaseId: string | null;
    readonly desiredState: string;
    readonly observedState: string;
    readonly activation: ActivationPolicy;
    readonly basePath: string;
    readonly config: { readonly mode: string };
    readonly error: string | null;
    readonly updatedAt: string;
  };
  readonly releases: readonly ReleaseRecord[];
  readonly hostUrl: string | null;
}
interface ApiResponse<T> {
  readonly data: T;
}
interface ConfigResponse {
  readonly mode: 'file' | 'external';
  readonly content: string | null;
  readonly path: string | null;
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
  const [apps, setApps] = useState<readonly AppDetail[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [tab, setTab] = useState<DetailTab>('deployments');
  const [view, setView] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [configMode, setConfigMode] = useState<ConfigMode>('file');
  const [configContent, setConfigContent] = useState('');
  const [deploymentMode, setDeploymentMode] = useState<ConfigMode>('file');
  const [deploymentContent, setDeploymentContent] = useState('');
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>();
  const [artifact, setArtifact] = useState<File>();
  const [deployOpen, setDeployOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newAppId, setNewAppId] = useState('');
  const [newAppName, setNewAppName] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const selected = apps.find((entry) => entry.app.id === selectedId);
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

  const loadApps = useCallback(async (): Promise<void> => {
    const response =
      await client.request<ApiResponse<readonly AppDetail[]>>('hub/apps');
    setApps(response.data);
  }, [client]);
  const loadConfig = useCallback(
    async (appId: string, template?: string | null): Promise<void> => {
      const response = await client.request<ApiResponse<ConfigResponse>>(
        `hub/apps/${appId}/config`,
      );
      setConfigMode(response.data.mode);
      setConfigContent(response.data.content || template || '');
      setConfigPath(response.data.path);
    },
    [client],
  );
  const selectedAppId = selected?.app.id;
  const selectedTemplate = release?.configTemplate;

  useEffect(() => {
    // Initial loading synchronizes the page with the Hub service.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadApps()
      .catch((reason: unknown) => setError(readError(reason)))
      .finally(() => setLoading(false));
  }, [loadApps]);
  useEffect(() => {
    const pending = apps.some((app) =>
      app.deployments.some(
        (item) => item.status === 'queued' || item.status === 'deploying',
      ),
    );
    if (!pending) return;
    const timer = window.setInterval(() => {
      void loadApps().catch((reason: unknown) => setError(readError(reason)));
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [apps, loadApps]);
  useEffect(() => {
    if (!selectedAppId) return;
    // Configuration loading is an intentional external synchronization boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConfig(selectedAppId, selectedTemplate).catch((reason: unknown) =>
      setError(readError(reason)),
    );
  }, [loadConfig, release?.id, selectedAppId, selectedTemplate]);

  const perform = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      await loadApps();
    } catch (reason) {
      setError(readError(reason));
    } finally {
      setBusy(false);
    }
  };
  const selectApp = (id: string, hasReleases?: boolean): void => {
    const app = apps.find((entry) => entry.app.id === id);
    setSelectedId(id);
    setSelectedReleaseId(undefined);
    const releases = hasReleases ?? Boolean(app?.releases.length);
    setTab(
      !releases
        ? 'development'
        : app?.deployments.length
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
        {!selected ? (
          <Catalog
            apps={filtered}
            total={apps.length}
            loading={loading}
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
            tab={tab}
            release={release}
            configMode={configMode}
            configContent={configContent}
            configPath={configPath}
            busy={busy}
            onBack={() => setSelectedId(undefined)}
            onTab={setTab}
            onRelease={setSelectedReleaseId}
            onConfigContent={setConfigContent}
            onSaveConfig={() =>
              void perform(() =>
                saveConfig(client, selected.app.id, configMode, configContent),
              )
            }
            onRefresh={() =>
              void perform(async () => {
                await client.request(`hub/apps/${selected.app.id}/refresh`, {
                  method: 'POST',
                });
              })
            }
            onStart={() =>
              void perform(async () => {
                await client.request(`hub/apps/${selected.app.id}/start`, {
                  method: 'POST',
                });
              })
            }
            onSaveSettings={(activation) =>
              void perform(async () => {
                await client.request(`hub/apps/${selected.app.id}/settings`, {
                  method: 'PUT',
                  body: JSON.stringify({ activation }),
                });
              })
            }
            onRemove={() => setRemoveOpen(true)}
            onStop={() =>
              void perform(async () => {
                await client.request(`hub/apps/${selected.app.id}/stop`, {
                  method: 'POST',
                });
              })
            }
            onDeploy={() => {
              setDeploymentMode(configMode);
              setDeploymentContent(configContent);
              setDeployOpen(true);
            }}
            onRollback={(deploymentId) =>
              void perform(async () => {
                await client.request(`hub/apps/${selected.app.id}/rollback`, {
                  method: 'POST',
                  body: JSON.stringify({ deploymentId }),
                });
              })
            }
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
            })
          }
        />
      ) : null}
      {deployOpen && selected ? (
        <DeploymentDialog
          app={selected}
          releaseId={releaseId}
          mode={deploymentMode}
          content={deploymentContent}
          busy={busy}
          onRelease={setSelectedReleaseId}
          onMode={setDeploymentMode}
          onContent={setDeploymentContent}
          onClose={() => setDeployOpen(false)}
          onComplete={() =>
            void perform(async () => {
              if (!releaseId || deploymentMode === 'managed') return;
              await client.request(`hub/apps/${selected.app.id}/deploy`, {
                method: 'POST',
                body: JSON.stringify({
                  releaseId,
                  config: {
                    mode: deploymentMode,
                    ...(deploymentMode === 'file'
                      ? { content: deploymentContent }
                      : {}),
                  },
                }),
              });
              setConfigMode(deploymentMode);
              setConfigContent(deploymentContent);
              setDeployOpen(false);
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
            })
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
  query,
  view,
  onQuery,
  onView,
  onCreate,
  onSelect,
}: {
  readonly apps: readonly AppDetail[];
  readonly total: number;
  readonly loading: boolean;
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
        <Button onClick={onCreate}>
          <Plus className='size-4' /> New application
        </Button>
      </header>
      <div className='mb-5 flex items-center gap-3'>
        <label className='flex h-10 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border bg-background px-3'>
          <Search className='size-4 text-muted-foreground' />
          <Input
            className='h-auto border-0 p-0 focus-visible:ring-0'
            onChange={(event) => onQuery(event.target.value)}
            placeholder='Search applications…'
            value={query}
          />
        </label>
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
  readonly app: AppDetail;
  readonly onClick: () => void;
}): ReactElement {
  const active = findRelease(app, app.deployment.observedReleaseId);
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
            {active ? `v${active.version}` : 'Not deployed'}
          </span>
          <span aria-hidden='true'>·</span>
          <span>{formatDate(app.deployment.updatedAt)}</span>
        </CardContent>
      </Button>
      <div className='pointer-events-none absolute top-4 right-4'>
        <StatusBadge state={app.deployment.observedState} />
      </div>
      <ChevronRight className='pointer-events-none absolute right-3 bottom-3 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5' />
    </Card>
  );
}
function AppListRow({
  app,
  onClick,
}: {
  readonly app: AppDetail;
  readonly onClick: () => void;
}): ReactElement {
  const active = findRelease(app, app.deployment.observedReleaseId);
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
        <StatusBadge state={app.deployment.observedState} />
      </TableCell>
      <TableCell className='text-sm text-muted-foreground'>
        {active ? `v${active.version}` : 'Not deployed'}
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
  app,
  tab,
  release,
  configMode,
  configContent,
  configPath,
  busy,
  onBack,
  onTab,
  onRelease,
  onConfigContent,
  onSaveConfig,
  onRefresh,
  onStart,
  onSaveSettings,
  onRemove,
  onStop,
  onDeploy,
  onRollback,
  onUpload,
}: {
  readonly app: AppDetail;
  readonly tab: DetailTab;
  readonly release: ReleaseRecord | undefined;
  readonly configMode: ConfigMode;
  readonly configContent: string;
  readonly configPath: string | null;
  readonly busy: boolean;
  readonly onBack: () => void;
  readonly onTab: (tab: DetailTab) => void;
  readonly onRelease: (id: string) => void;
  readonly onConfigContent: (content: string) => void;
  readonly onSaveConfig: () => void;
  readonly onRefresh: () => void;
  readonly onStart: () => void;
  readonly onSaveSettings: (activation: ActivationPolicy) => void;
  readonly onRemove: () => void;
  readonly onStop: () => void;
  readonly onDeploy: () => void;
  readonly onRollback: (deploymentId: string) => void;
  readonly onUpload: () => void;
}): ReactElement {
  const deployed = hasDeployment(app);
  const detailTabs: readonly DetailTab[] = [
    ...(app.releases.length === 0 ? (['development'] as const) : []),
    'deployments',
    'releases',
    'resources',
    ...(deployed ? (['configuration'] as const) : []),
    'settings',
  ];
  const activeTab = detailTabs.includes(tab)
    ? tab
    : app.releases.length === 0
      ? 'development'
      : app.deployments.length
        ? 'deployments'
        : 'releases';
  const visitUrl = applicationUrl(app);
  const running = app.deployment.observedState === 'running';
  const registered = app.deployment.observedState === 'registered';
  const transitioning = app.deployments.some(
    (item) => item.status === 'queued' || item.status === 'deploying',
  );
  const activeRelease = findRelease(app, app.deployment.observedReleaseId);
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
                        {activeRelease
                          ? `v${activeRelease.version}`
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
                {visitUrl && (running || registered) ? (
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
                  disabled={busy || !deployed || running || transitioning}
                  onClick={onStart}
                  variant='outline'
                >
                  <Play className='size-4' /> Start
                </Button>
                <Button
                  disabled={busy || !running}
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
            {app.releases.length === 0 ? (
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
                  mode={configMode}
                  content={configContent}
                  path={configPath}
                  busy={busy}
                  onContent={onConfigContent}
                  onSave={onSaveConfig}
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
          <Button
            disabled={busy || app.releases.length === 0}
            onClick={onDeploy}
          >
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
        <Button disabled={busy || app.releases.length === 0} onClick={onDeploy}>
          <Play className='size-4' /> Deploy
        </Button>
      </div>
      <div className='overflow-hidden rounded-xl border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Release</TableHead>
              <TableHead>Operation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Artifact</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {app.deployments.map((deployment) => {
              const deployedRelease = findRelease(app, deployment.releaseId);
              const current = deployment.id === app.app.currentDeploymentId;
              return (
                <TableRow key={deployment.id}>
                  <TableCell>
                    <span className='font-medium'>
                      {deployedRelease
                        ? `v${deployedRelease.version}`
                        : 'Unknown'}
                    </span>
                    {deployedRelease ? (
                      <span className='ml-2 font-mono text-[11px] text-muted-foreground'>
                        {deployedRelease.checksum.slice(0, 12)}
                      </span>
                    ) : null}
                    {current ? (
                      <Badge className='ml-2 bg-emerald-500/10 text-emerald-700'>
                        Current
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className='capitalize'>
                    {deployment.kind === 'rollback' ? 'Rollback' : 'Deploy'}
                  </TableCell>
                  <TableCell>
                    <div className='space-y-1'>
                      <StatusBadge state={deployment.status} />
                      {deployment.status === 'deploying' ? (
                        <div className='text-xs capitalize text-muted-foreground'>
                          {deployment.phase.replaceAll('_', ' ')}
                        </div>
                      ) : deployment.error ? (
                        <DeploymentError message={deployment.error} />
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {deployment.status === 'succeeded' &&
                    deployment.cacheHit !== null ? (
                      <Badge
                        className={
                          deployment.cacheHit
                            ? 'bg-sky-500/10 text-sky-700'
                            : 'bg-violet-500/10 text-violet-700'
                        }
                      >
                        {deployment.cacheHit ? 'Cached' : 'Expanded'}
                      </Badge>
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    )}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {formatDate(deployment.createdAt)}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button
                      disabled={deployment.status !== 'succeeded' || current}
                      onClick={() => onRollback(deployment.id)}
                      size='sm'
                      variant='ghost'
                    >
                      <RotateCcw className='size-4' /> Roll back
                    </Button>
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

function DeploymentError({
  message,
}: {
  readonly message: string;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <div className='mt-1 flex max-w-md items-start gap-1 text-xs text-destructive'>
      <span className='min-w-0 flex-1 select-text whitespace-normal break-words leading-5'>
        {message}
      </span>
      <Button
        aria-label='Copy deployment error'
        className='-mt-1 size-7 shrink-0 text-destructive hover:text-destructive'
        onClick={() => void copy()}
        size='icon'
        title={copied ? 'Copied' : 'Copy error'}
        variant='ghost'
      >
        {copied ? <ClipboardCheck /> : <Clipboard />}
      </Button>
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
  path,
  busy,
  onContent,
  onSave,
}: {
  readonly mode: ConfigMode;
  readonly content: string;
  readonly path: string | null;
  readonly busy: boolean;
  readonly onContent: (content: string) => void;
  readonly onSave: () => void;
}): ReactElement {
  const source = CONFIG_MODES.find((item) => item.value === mode);
  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='font-semibold'>Configuration</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            This source was selected during the latest deployment.
          </p>
        </div>
        <Badge className='gap-1.5 bg-muted text-foreground [&_svg]:size-3.5'>
          {source?.icon} {source?.title ?? mode}
        </Badge>
      </div>
      <div className='rounded-lg border bg-muted/20 px-4 py-3 text-xs leading-5 text-muted-foreground'>
        To use a different configuration source, start a new deployment and
        select it in the Configuration step.
      </div>
      {mode === 'file' ? (
        <div className='overflow-hidden rounded-xl border'>
          <div className='flex items-center justify-between border-b bg-muted/20 px-4 py-3'>
            <div>
              <span className='flex items-center gap-2 text-sm font-medium'>
                <FileCode2 className='size-4' /> config.yml
              </span>
              <span className='mt-1 block font-mono text-[11px] text-muted-foreground'>
                {path ?? 'Created when saved'}
              </span>
            </div>
          </div>
          <Textarea
            aria-label='config.yml content'
            className='min-h-[420px] resize-y rounded-none border-0 bg-slate-950 p-5 font-mono text-[13px] leading-6 text-slate-100 focus-visible:ring-0'
            onChange={(event) => onContent(event.target.value)}
            spellCheck={false}
            value={content}
          />
          <div className='flex justify-end border-t bg-muted/20 p-3'>
            <Button disabled={busy} onClick={onSave}>
              Save configuration
            </Button>
          </div>
        </div>
      ) : null}
      {mode === 'external' ? (
        <Panel title='External configuration' icon={<ExternalLink />}>
          <p className='text-sm leading-6 text-muted-foreground'>
            Hub will not mount a configuration file. Runtime configuration and
            secrets must be supplied by the external environment.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}

function DeploymentDialog({
  app,
  releaseId,
  mode,
  content,
  busy,
  onRelease,
  onMode,
  onContent,
  onClose,
  onComplete,
}: {
  readonly app: AppDetail;
  readonly releaseId: string | undefined;
  readonly mode: ConfigMode;
  readonly content: string;
  readonly busy: boolean;
  readonly onRelease: (releaseId: string) => void;
  readonly onMode: (mode: ConfigMode) => void;
  readonly onContent: (content: string) => void;
  readonly onClose: () => void;
  readonly onComplete: () => void;
}): ReactElement {
  const [step, setStep] = useState(0);
  const release = app.releases.find((item) => item.id === releaseId);
  return (
    <AppDialog
      title='Deploy application'
      description={app.app.name}
      onClose={onClose}
      wide
    >
      <div className='mb-6 flex items-center gap-3 text-sm'>
        <Badge className={step === 0 ? '' : 'bg-muted text-muted-foreground'}>
          1&nbsp; Release
        </Badge>
        <span className='h-px flex-1 bg-border' />
        <Badge className={step === 1 ? '' : 'bg-muted text-muted-foreground'}>
          2&nbsp; Configuration
        </Badge>
        <span className='h-px flex-1 bg-border' />
        <Badge className={step === 2 ? '' : 'bg-muted text-muted-foreground'}>
          3&nbsp; Review
        </Badge>
      </div>
      <div>
        {step === 0 ? (
          <div className='max-h-[22rem] overflow-y-auto rounded-xl border'>
            {app.releases.map((item) => (
              <Button
                className={`grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] justify-stretch rounded-none border-b px-4 py-3 text-left last:border-0 ${releaseId === item.id ? 'bg-primary/5' : ''}`}
                key={item.id}
                onClick={() => onRelease(item.id)}
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
        ) : step === 1 ? (
          <div className='space-y-5'>
            <ConfigModePicker value={mode} onChange={onMode} />
            {mode === 'file' ? (
              <Textarea
                aria-label='Deployment config.yml'
                className='min-h-64 w-full rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100'
                onChange={(event) => onContent(event.target.value)}
                value={content}
              />
            ) : null}
            {release?.configTemplate ? (
              <p className='text-xs text-muted-foreground'>
                This release includes a config.yml template. Existing saved
                configuration will not be overwritten.
              </p>
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
          </div>
        )}
      </div>
      <div className='mt-7 flex justify-between gap-2'>
        <Button
          onClick={step === 0 ? onClose : () => setStep(step - 1)}
          variant='outline'
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < 2 ? (
          <Button
            disabled={!release || (step === 1 && mode === 'managed')}
            onClick={() => setStep(step + 1)}
          >
            Continue <ChevronRight />
          </Button>
        ) : (
          <Button
            disabled={busy || !release || mode === 'managed'}
            onClick={onComplete}
          >
            {busy ? 'Deploying…' : 'Deploy'}
          </Button>
        )}
      </div>
    </AppDialog>
  );
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
      description='Upload a built application artifact. Version and config.yml are detected automatically.'
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
  return (
    <div className='grid gap-3 md:grid-cols-3'>
      {CONFIG_MODES.map((item) => (
        <Button
          className={`relative h-auto min-h-20 flex-col items-stretch justify-start whitespace-normal rounded-xl p-3 text-left ${value === item.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
          disabled={item.disabled}
          key={item.value}
          onClick={() => onChange(item.value)}
          variant='outline'
        >
          <span className='flex items-center gap-2 pr-5 text-sm font-medium'>
            <span className='text-muted-foreground [&_svg]:size-4'>
              {item.icon}
            </span>
            <span>{item.title}</span>
            {item.disabled ? <Badge className='text-[9px]'>Soon</Badge> : null}
          </span>
          <span className='mt-1 block pl-6 text-[11px] leading-4 text-muted-foreground'>
            {item.description}
          </span>
          {value === item.value ? (
            <Check className='absolute top-3 right-3 size-3.5 text-primary' />
          ) : null}
        </Button>
      ))}
    </div>
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
        style={wide ? { width: 'min(48rem, calc(100vw - 2rem))' } : undefined}
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
function Panel({
  title,
  icon,
  children,
}: {
  readonly title: string;
  readonly icon: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Card className='p-5'>
      <CardHeader className='mb-4 flex-row items-center gap-2 p-0 text-sm font-semibold'>
        <span className='text-muted-foreground [&_svg]:size-4'>{icon}</span>
        {title}
      </CardHeader>
      {children}
    </Card>
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
            : state === 'registered'
              ? 'bg-sky-500/10 text-sky-700'
              : 'bg-muted text-muted-foreground';
  return (
    <Badge className={`self-center gap-1.5 whitespace-nowrap ${style}`}>
      <span
        className={`size-1.5 rounded-full ${state === 'running' || state === 'succeeded' ? 'bg-emerald-500' : state === 'failed' ? 'bg-destructive' : state === 'pending' || state === 'queued' || state === 'deploying' ? 'bg-amber-500' : state === 'registered' ? 'bg-sky-500' : 'bg-slate-400'}`}
      />
      {stateLabel(state)}
    </Badge>
  );
}
function findRelease(
  app: AppDetail,
  id: string | null,
): ReleaseRecord | undefined {
  return app.releases.find((item) => item.id === id);
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
async function saveConfig(
  client: import('@nocobase/app-client').AppClient,
  appId: string,
  mode: ConfigMode,
  content: string,
): Promise<void> {
  if (mode === 'managed') return;
  await client.request(`hub/apps/${appId}/config`, {
    method: 'PUT',
    body: JSON.stringify({ mode, ...(mode === 'file' ? { content } : {}) }),
  });
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
  if (value === 'registered') return 'Ready';
  if (value === 'pending') return 'Updating';
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : 'Unknown';
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
function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function readError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

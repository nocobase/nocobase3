import {
  ArrowLeft,
  CircleStop,
  Clipboard,
  ClipboardCheck,
  Code2,
  ExternalLink,
  LoaderCircle,
  Play,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '../../components/ui/button.js';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '../../components/ui/card.js';
import {
  Dialog as UiDialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.js';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs.js';
import { useState, type ReactElement } from 'react';
import type {
  DetailTab,
  AppDetail,
  ReleaseRecord,
  ConfigMode,
  ActivationPolicy,
} from './types.js';
import { AppMark, StatusBadge } from './shared.js';
import { Deployments } from './deployments.js';
import { Releases } from './releases.js';
import { Resources } from './resources.js';
import { Configuration } from './configuration.js';
import { Settings } from './settings.js';
import { applicationUrl, hasDeployment, formatDate } from './utils.js';

const TAB_LABELS: Readonly<Record<DetailTab, string>> = {
  deployments: 'Deployments',
  releases: 'Releases',
  development: 'Development',
  resources: 'Resources',
  configuration: 'Configuration',
  settings: 'Settings',
};

export function Detail({
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

export function RemoveApplicationDialog({
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

export function Development({
  appId,
}: {
  readonly appId: string;
}): ReactElement {
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

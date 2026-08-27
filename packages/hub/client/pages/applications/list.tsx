import {
  Boxes,
  ExternalLink,
  Grid2X2,
  List,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Square,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslate } from '@refinedev/core';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import {
  type HubApplication,
  type HubCapabilities,
  type HubDeployment,
  type HubFetcher,
  type HubMe,
  hasHubCapability,
  hubPost,
  hubRequest,
  useHubQuery,
} from '@/features/hub/api';
import {
  formatHubDate,
  getHubErrorMessage,
  HubEmptyState,
  HubErrorState,
  HubLoadMore,
  HubListSkeleton,
  HubStatusBadge,
} from '@/features/hub/components';
import { useHubPaginatedQuery } from '@/features/hub/pagination';
import { useOptionalHubRuntime } from '@/features/hub/provider';
import { getHubEnvironmentLabel } from '@/features/hub/labels';

export interface ApplicationsPageProps {
  fetcher?: HubFetcher;
  onCreateApplication?: () => void;
}

export function ApplicationsPage({
  fetcher,
  onCreateApplication,
}: ApplicationsPageProps) {
  const translate = useTranslate();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState('all');
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [createOpen, setCreateOpen] = useState(false);
  const applications = useHubPaginatedQuery<HubApplication>({
    path: useMemo(() => {
      const params = new URLSearchParams();
      const query = deferredSearch.trim();
      if (query) params.set('query', query);
      if (status !== 'all') params.set('status', status);
      const encoded = params.toString();
      return encoded ? `/apps?${encoded}` : '/apps';
    }, [deferredSearch, status]),
    fetcher,
  });
  const runtime = useOptionalHubRuntime();
  const me = useHubQuery<HubMe>({
    path: runtime ? null : '/me',
    fetcher,
    enabled: !runtime,
  });
  const canCreate = hasHubCapability(
    runtime?.me.capabilities ?? me.data?.capabilities,
    'hub.app',
    'create',
  );
  const capabilities = runtime?.me.capabilities ?? me.data?.capabilities;
  const visibleApplications = applications.data ?? [];
  const openCreateApplication = () => {
    if (onCreateApplication) {
      onCreateApplication();
    } else {
      setCreateOpen(true);
    }
  };

  return (
    <div className='space-y-6'>
      <header className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-1'>
          <div className='flex items-center gap-2 text-muted-foreground'>
            <Boxes className='size-4' aria-hidden='true' />
            <span className='text-sm font-medium'>
              {translate('hub.apps.eyebrow', 'Control plane')}
            </span>
          </div>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {translate('hub.apps.title', 'Applications')}
          </h1>
          <p className='max-w-2xl text-sm text-muted-foreground'>
            {translate(
              'hub.apps.description',
              'Inspect deployed applications, active releases, environments, and runtime state from one place.',
            )}
          </p>
        </div>
        {canCreate ? (
          <Button type='button' onClick={openCreateApplication}>
            <Plus aria-hidden='true' />
            {translate('hub.apps.create', 'Create application')}
          </Button>
        ) : null}
      </header>

      {applications.error ? (
        <HubErrorState
          error={applications.error}
          onRetry={applications.reload}
        />
      ) : applications.loading ? (
        <HubListSkeleton rows={5} />
      ) : (applications.data?.length ?? 0) === 0 ? (
        <HubEmptyState
          title={translate('hub.apps.empty.title', 'No applications yet')}
          description={translate(
            'hub.apps.empty.description',
            'Create an application from the default template, then use a local Coding Agent to develop and publish it.',
          )}
          action={
            canCreate ? (
              <Button type='button' onClick={openCreateApplication}>
                <Plus aria-hidden='true' />
                {translate('hub.apps.create', 'Create application')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
            <label className='relative min-w-0 flex-1 sm:max-w-sm'>
              <span className='sr-only'>
                {translate('hub.apps.search.label', 'Search applications')}
              </span>
              <Search
                className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
                aria-hidden='true'
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={translate(
                  'hub.apps.search.placeholder',
                  'Search by name or slug',
                )}
                className='pl-8'
              />
            </label>
            <label className='flex items-center gap-2 text-sm text-muted-foreground'>
              <span>{translate('hub.common.status', 'Status')}</span>
              <NativeSelect
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label={translate(
                  'hub.apps.filter.statusAria',
                  'Filter by status',
                )}
              >
                <NativeSelectOption value='all'>
                  {translate('hub.apps.filter.allStatuses', 'All statuses')}
                </NativeSelectOption>
                <NativeSelectOption value='active'>
                  {translate('hub.status.active', 'Active')}
                </NativeSelectOption>
                <NativeSelectOption value='archived'>
                  {translate('hub.status.archived', 'Archived')}
                </NativeSelectOption>
              </NativeSelect>
            </label>
            <div
              className='ml-auto flex items-center rounded-lg border bg-background p-0.5'
              aria-label={translate('hub.apps.view.label', 'Application view')}
            >
              <Button
                type='button'
                size='icon-sm'
                variant={view === 'cards' ? 'secondary' : 'ghost'}
                aria-label={translate('hub.apps.view.cards', 'Card view')}
                aria-pressed={view === 'cards'}
                onClick={() => setView('cards')}
              >
                <Grid2X2 aria-hidden='true' />
              </Button>
              <Button
                type='button'
                size='icon-sm'
                variant={view === 'list' ? 'secondary' : 'ghost'}
                aria-label={translate('hub.apps.view.list', 'List view')}
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                <List aria-hidden='true' />
              </Button>
            </div>
          </div>

          {visibleApplications.length === 0 ? (
            <HubEmptyState
              title={translate(
                'hub.apps.noMatches.title',
                'No matching applications',
              )}
              description={translate(
                'hub.apps.noMatches.description',
                'Change the search text or status filter to see other applications.',
              )}
            />
          ) : (
            <ApplicationResults
              applications={visibleApplications}
              view={view}
              capabilities={capabilities}
              fetcher={fetcher}
              onChanged={applications.reload}
            />
          )}

          <p className='text-xs text-muted-foreground'>
            {translate(
              'hub.apps.summary',
              {
                visible: visibleApplications.length,
                total:
                  applications.meta?.total ?? applications.data?.length ?? 0,
              },
              'Showing {{visible}} of {{total}} applications',
            )}
          </p>
          <HubLoadMore
            hasMore={applications.hasMore}
            loading={applications.loadingMore}
            onLoadMore={applications.loadMore}
          />
        </>
      )}
      <CreateApplicationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        fetcher={fetcher}
        onCreated={applications.reload}
      />
    </div>
  );
}

function CreateApplicationDialog({
  open,
  onOpenChange,
  fetcher,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetcher?: HubFetcher;
  onCreated: () => void;
}) {
  const translate = useTranslate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = () => {
    setName('');
    setSlug('');
    setDescription('');
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !submitting) reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitting(true);
            setError(null);
            void hubRequest<HubApplication>(
              '/apps',
              {
                method: 'POST',
                headers: { 'idempotency-key': crypto.randomUUID() },
                body: JSON.stringify({
                  name: name.trim(),
                  slug: slug.trim(),
                  description: description.trim() || undefined,
                }),
              },
              fetcher,
            )
              .then(() => {
                onOpenChange(false);
                reset();
                onCreated();
              })
              .catch((reason: unknown) => {
                setError(
                  reason instanceof Error ? reason : new Error(String(reason)),
                );
              })
              .finally(() => setSubmitting(false));
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {translate('hub.apps.createDialog.title', 'Create application')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'hub.apps.createDialog.description',
                'Register the stable identity used by releases and deployments.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='rounded-lg border bg-muted/35 p-3 text-sm'>
            <p className='font-medium'>
              {translate(
                'hub.apps.createDialog.templateTitle',
                'Default application template',
              )}
            </p>
            <p className='mt-1 text-muted-foreground'>
              {translate(
                'hub.apps.createDialog.templateDescription',
                'Hub prepares a deployable initial Release from the default template. Application source remains on the developer machine.',
              )}
            </p>
          </div>
          {error ? (
            <Alert variant='destructive'>
              <AlertTitle>
                {translate(
                  'hub.apps.createDialog.error',
                  'Unable to create application',
                )}
              </AlertTitle>
              <AlertDescription>
                {getHubErrorMessage(error, translate)}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className='space-y-2'>
            <Label htmlFor='hub-application-name'>
              {translate('hub.common.name', 'Name')}
            </Label>
            <Input
              id='hub-application-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='hub-application-slug'>
              {translate('hub.common.slug', 'Slug')}
            </Label>
            <Input
              id='hub-application-slug'
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              pattern={'[a-z0-9](?:[a-z0-9\\-]*[a-z0-9])?'}
              placeholder='orders'
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='hub-application-description'>
              {translate('hub.common.description', 'Description')}
            </Label>
            <Input
              id='hub-application-description'
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              {translate('hub.common.cancel', 'Cancel')}
            </Button>
            <Button type='submit' disabled={submitting}>
              {submitting
                ? translate('hub.apps.createDialog.submitting', 'Creating…')
                : translate('hub.apps.createDialog.submit', 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApplicationResults({
  applications,
  view,
  capabilities,
  fetcher,
  onChanged,
}: {
  applications: HubApplication[];
  view: 'cards' | 'list';
  capabilities: HubCapabilities | undefined;
  fetcher?: HubFetcher;
  onChanged: () => void;
}) {
  const translate = useTranslate();
  if (view === 'cards') {
    return (
      <div className='grid gap-4 md:grid-cols-2 2xl:grid-cols-3'>
        {applications.map((application) => {
          return (
            <Card key={application.id} className='overflow-hidden'>
              <CardHeader className='gap-3'>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <CardTitle className='flex flex-wrap items-center gap-2'>
                      <Link
                        className='truncate underline-offset-4 hover:underline'
                        to={`/apps/${encodeURIComponent(application.id)}`}
                      >
                        {application.name}
                      </Link>
                      {application.isDefault ? (
                        <span className='rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'>
                          {translate('hub.apps.default', 'Default')}
                        </span>
                      ) : null}
                    </CardTitle>
                    <CardDescription className='mt-1 font-mono text-xs'>
                      {application.slug}
                    </CardDescription>
                  </div>
                  <HubStatusBadge status={application.status} />
                </div>
                {application.description ? (
                  <p className='line-clamp-2 text-sm text-muted-foreground'>
                    {application.description}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='flex flex-wrap gap-2'>
                  {application.runtime ? (
                    <>
                      <HubStatusBadge status={application.runtime.state} />
                      <HubStatusBadge status={application.runtime.health} />
                    </>
                  ) : (
                    <HubStatusBadge status='unknown' />
                  )}
                </div>
                <dl className='grid grid-cols-2 gap-4 text-sm'>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {translate(
                        'hub.apps.columns.currentRelease',
                        'Current release',
                      )}
                    </dt>
                    <dd className='mt-1 font-medium'>
                      {currentReleaseLabel(
                        application,
                        translate('hub.apps.notDeployed', 'Not deployed'),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {translate(
                        'hub.apps.columns.latestRelease',
                        'Latest release',
                      )}
                    </dt>
                    <dd className='mt-1 truncate font-medium'>
                      {application.latestRelease?.version ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {translate('hub.common.environment', 'Environment')}
                    </dt>
                    <dd className='mt-1 font-medium'>
                      {getHubEnvironmentLabel(
                        application.defaultEnvironmentId,
                        translate,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {translate(
                        'hub.apps.columns.healthChecked',
                        'Health checked',
                      )}
                    </dt>
                    <dd className='mt-1 font-medium'>
                      {formatHubDate(application.runtime?.lastCheckedAt)}
                    </dd>
                  </div>
                </dl>
              </CardContent>
              <CardFooter className='border-t bg-muted/15'>
                <ApplicationQuickActions
                  application={application}
                  capabilities={capabilities}
                  fetcher={fetcher}
                  onChanged={onChanged}
                />
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  }
  return (
    <Card className='py-0'>
      <CardContent className='px-0'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='pl-4'>
                {translate('hub.common.application', 'Application')}
              </TableHead>
              <TableHead>{translate('hub.common.status', 'Status')}</TableHead>
              <TableHead>
                {translate('hub.apps.columns.health', 'Health')}
              </TableHead>
              <TableHead>
                {translate(
                  'hub.apps.columns.currentRelease',
                  'Current release',
                )}
              </TableHead>
              <TableHead>
                {translate('hub.common.environment', 'Environment')}
              </TableHead>
              <TableHead>
                {translate('hub.common.updated', 'Updated')}
              </TableHead>
              <TableHead className='text-right'>
                {translate('hub.common.actions', 'Actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((application) => (
              <TableRow key={application.id}>
                <TableCell className='pl-4'>
                  <Link
                    className='font-medium text-foreground underline-offset-4 hover:underline'
                    to={`/apps/${encodeURIComponent(application.id)}`}
                  >
                    {application.name}
                  </Link>
                  <div className='text-xs text-muted-foreground'>
                    {application.slug}
                  </div>
                </TableCell>
                <TableCell>
                  <HubStatusBadge status={application.status} />
                </TableCell>
                <TableCell>
                  <HubStatusBadge
                    status={application.runtime?.health ?? 'unknown'}
                  />
                </TableCell>
                <TableCell className='font-mono text-xs'>
                  {currentReleaseLabel(
                    application,
                    translate('hub.apps.notDeployed', 'Not deployed'),
                  )}
                </TableCell>
                <TableCell>
                  {getHubEnvironmentLabel(
                    application.defaultEnvironmentId,
                    translate,
                  )}
                </TableCell>
                <TableCell>{formatHubDate(application.updatedAt)}</TableCell>
                <TableCell>
                  <ApplicationQuickActions
                    application={application}
                    capabilities={capabilities}
                    fetcher={fetcher}
                    onChanged={onChanged}
                    align='end'
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ApplicationQuickActions({
  application,
  capabilities,
  fetcher,
  onChanged,
  align = 'start',
}: {
  application: HubApplication;
  capabilities: HubCapabilities | undefined;
  fetcher?: HubFetcher;
  onChanged: () => void;
  align?: 'start' | 'end';
}) {
  const translate = useTranslate();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pendingAction, setPendingAction] =
    useState<ApplicationQuickAction | null>(null);
  const encodedId = encodeURIComponent(application.id);
  const isActive = application.status === 'active';
  const isRunning = application.runtime?.state === 'running';
  const isIdle = application.runtime?.state === 'idle';
  const isStopped = application.runtime?.state === 'stopped';
  const activeReleaseId = application.activeRelease?.id;
  const latestReleaseId = application.latestRelease?.id;
  const hasActiveRelease = Boolean(activeReleaseId);
  const canManage = hasHubCapability(
    capabilities,
    'hub.app',
    'read',
    application.id,
  );
  const canDevelop =
    isActive &&
    hasHubCapability(capabilities, 'hub.release', 'create', application.id);
  const canControlRuntime =
    isActive &&
    hasActiveRelease &&
    hasHubCapability(capabilities, 'hub.runtime', 'control', application.id);
  const canDeploy =
    isActive &&
    !hasActiveRelease &&
    Boolean(latestReleaseId) &&
    hasHubCapability(capabilities, 'hub.deployment', 'deploy', application.id);
  const canRedeploy =
    isActive &&
    isRunning &&
    hasActiveRelease &&
    hasHubCapability(
      capabilities,
      'hub.deployment',
      'redeploy',
      application.id,
    );
  const label = (key: string, fallback: string) =>
    translateWithValues(translate, key, fallback, {
      name: application.name,
    });
  const run = (action: ApplicationQuickAction) => {
    const request = createQuickActionRequest({
      action,
      application,
      encodedId,
      fetcher,
    });
    setBusy(action);
    setError(null);
    void request
      .then((result) => {
        onChanged();
        setPendingAction(null);
        if (result.deploymentId) {
          void navigate(`/deployments/${result.deploymentId}`);
        }
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => setBusy(null));
  };
  const actionCopy = pendingAction
    ? getQuickActionCopy(pendingAction, application, translate)
    : null;

  return (
    <div
      className={`flex min-w-0 flex-1 flex-wrap gap-2 ${
        align === 'end' ? 'justify-end' : ''
      }`}
    >
      {application.links?.open ? (
        <Button
          size='sm'
          nativeButton={false}
          render={
            <a
              href={application.links.open}
              target='_blank'
              rel='noreferrer'
              aria-label={label('hub.apps.actions.openAria', 'Open {{name}}')}
            />
          }
        >
          <ExternalLink aria-hidden='true' />
          {translate('hub.apps.open', 'Open application')}
        </Button>
      ) : null}
      {canManage ? (
        <Button
          size='sm'
          variant='outline'
          nativeButton={false}
          render={
            <Link
              to={`/apps/${encodedId}`}
              aria-label={label(
                'hub.apps.actions.manageAria',
                'Manage {{name}}',
              )}
            />
          }
        >
          {translate('hub.apps.manage', 'Manage')}
        </Button>
      ) : null}
      {canDevelop ? (
        <Button
          size='sm'
          variant='ghost'
          nativeButton={false}
          render={
            <Link
              to={`/apps/${encodedId}?tab=development`}
              aria-label={label(
                'hub.apps.actions.developAria',
                'Develop {{name}}',
              )}
            />
          }
        >
          {translate('hub.apps.develop', 'Develop')}
        </Button>
      ) : null}
      {canDeploy && latestReleaseId ? (
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={busy !== null}
          aria-label={translateWithValues(
            translate,
            'hub.releases.deployAria',
            'Deploy {{version}}',
            { version: application.latestRelease?.version ?? '' },
          )}
          onClick={() => setPendingAction('deploy')}
        >
          <Rocket aria-hidden='true' />
          {translate('hub.releases.deploy', 'Deploy')}
        </Button>
      ) : null}
      {canControlRuntime && isStopped ? (
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={busy !== null}
          aria-label={label('hub.apps.actions.startAria', 'Start {{name}}')}
          onClick={() => setPendingAction('start')}
        >
          <Play aria-hidden='true' />
          {translate('hub.runtime.start', 'Start')}
        </Button>
      ) : null}
      {canControlRuntime && (isRunning || isIdle) ? (
        <>
          {isRunning ? (
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={busy !== null}
              aria-label={label(
                'hub.apps.actions.restartAria',
                'Restart {{name}}',
              )}
              onClick={() => setPendingAction('restart')}
            >
              <RefreshCw aria-hidden='true' />
              {translate('hub.runtime.restart', 'Restart')}
            </Button>
          ) : null}
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={busy !== null}
            aria-label={label('hub.apps.actions.stopAria', 'Stop {{name}}')}
            onClick={() => setPendingAction('stop')}
          >
            <Square aria-hidden='true' />
            {translate('hub.runtime.stop', 'Stop application')}
          </Button>
        </>
      ) : null}
      {canRedeploy ? (
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={busy !== null}
          aria-label={label(
            'hub.apps.actions.redeployAria',
            'Redeploy {{name}}',
          )}
          onClick={() => setPendingAction('redeploy')}
        >
          <Rocket aria-hidden='true' />
          {translate('hub.deployment.redeploy', 'Redeploy')}
        </Button>
      ) : null}
      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open && busy === null) {
            setPendingAction(null);
            setError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {actionCopy?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <Alert variant='destructive'>
              <AlertTitle>{actionCopy?.errorTitle}</AlertTitle>
              <AlertDescription>
                {getHubErrorMessage(error, translate)}
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>
              {translate('hub.common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null || pendingAction === null}
              onClick={(event) => {
                event.preventDefault();
                if (pendingAction) run(pendingAction);
              }}
            >
              {busy ? <Spinner aria-hidden='true' /> : null}
              {busy ? actionCopy?.pendingLabel : actionCopy?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type ApplicationQuickAction =
  'deploy' | 'redeploy' | 'start' | 'restart' | 'stop';

interface QuickActionRequestOptions {
  action: ApplicationQuickAction;
  application: HubApplication;
  encodedId: string;
  fetcher?: HubFetcher;
}

interface QuickActionResult {
  deploymentId?: string;
}

function createQuickActionRequest({
  action,
  application,
  encodedId,
  fetcher,
}: QuickActionRequestOptions): Promise<QuickActionResult> {
  if (action === 'deploy' || action === 'redeploy') {
    const targetReleaseId =
      action === 'deploy'
        ? application.latestRelease?.id
        : application.activeRelease?.id;
    return hubRequest<HubDeployment>(
      `/apps/${encodedId}/deployments`,
      {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ targetReleaseId, type: action }),
      },
      fetcher,
    ).then((result) => ({ deploymentId: result.data.id }));
  }
  if (action === 'restart') {
    return hubRequest(
      `/apps/${encodedId}/runtime/restart`,
      {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: '{}',
      },
      fetcher,
    ).then(() => ({}));
  }
  return hubPost(`/apps/${encodedId}/runtime/${action}`, {}, fetcher).then(
    () => ({}),
  );
}

interface QuickActionCopy {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  errorTitle: string;
}

type QuickActionCopyDefinition = Record<
  keyof QuickActionCopy,
  readonly [i18nKey: string, fallback: string]
>;

function getQuickActionCopy(
  action: ApplicationQuickAction,
  application: HubApplication,
  translate: ReturnType<typeof useTranslate>,
): QuickActionCopy {
  const values = {
    name: application.name,
    version:
      action === 'deploy'
        ? (application.latestRelease?.version ?? '—')
        : (application.activeRelease?.version ?? '—'),
  };
  const definitions: Record<ApplicationQuickAction, QuickActionCopyDefinition> =
    {
      deploy: {
        title: ['hub.application.deploy.title', 'Deploy release'],
        description: [
          'hub.apps.actions.deployConfirmDescription',
          'Deploy release {{version}} for {{name}}?',
        ],
        confirmLabel: ['hub.application.deploy.confirm', 'Confirm deployment'],
        pendingLabel: ['hub.apps.actions.deploying', 'Deploying…'],
        errorTitle: [
          'hub.application.deploy.error',
          'Unable to create deployment',
        ],
      },
      redeploy: {
        title: ['hub.application.redeploy.title', 'Redeploy current release'],
        description: [
          'hub.apps.actions.redeployConfirmDescription',
          'Redeploy release {{version}} for {{name}}?',
        ],
        confirmLabel: [
          'hub.application.redeploy.confirm',
          'Confirm redeployment',
        ],
        pendingLabel: ['hub.apps.actions.redeploying', 'Redeploying…'],
        errorTitle: [
          'hub.deployment.redeployDialog.error',
          'Unable to redeploy release',
        ],
      },
      start: {
        title: ['hub.runtime.confirm.startTitle', 'Start application'],
        description: [
          'hub.runtime.confirm.startDescription',
          'Start the runtime for {{name}}?',
        ],
        confirmLabel: ['hub.runtime.confirm.start', 'Confirm start'],
        pendingLabel: ['hub.runtime.starting', 'Starting…'],
        errorTitle: ['hub.runtime.error.start', 'Unable to start application'],
      },
      restart: {
        title: ['hub.runtime.confirm.restartTitle', 'Restart application'],
        description: [
          'hub.runtime.confirm.restartDescription',
          'Restart the runtime for {{name}}? Active requests may be interrupted.',
        ],
        confirmLabel: ['hub.runtime.confirm.restart', 'Confirm restart'],
        pendingLabel: ['hub.runtime.restarting', 'Restarting…'],
        errorTitle: [
          'hub.runtime.error.restart',
          'Unable to restart application',
        ],
      },
      stop: {
        title: ['hub.runtime.confirm.stopTitle', 'Stop application'],
        description: [
          'hub.runtime.confirm.stopDescription',
          'Stop the runtime for {{name}}? The application will be unavailable until it is started again.',
        ],
        confirmLabel: ['hub.runtime.confirm.stop', 'Confirm stop'],
        pendingLabel: ['hub.runtime.stopping', 'Stopping…'],
        errorTitle: ['hub.runtime.error.stop', 'Unable to stop application'],
      },
    };
  const definition = definitions[action];
  return {
    title: translateWithValues(translate, ...definition.title, values),
    description: translateWithValues(
      translate,
      ...definition.description,
      values,
    ),
    confirmLabel: translateWithValues(
      translate,
      ...definition.confirmLabel,
      values,
    ),
    pendingLabel: translateWithValues(
      translate,
      ...definition.pendingLabel,
      values,
    ),
    errorTitle: translateWithValues(
      translate,
      ...definition.errorTitle,
      values,
    ),
  };
}

function currentReleaseLabel(
  application: HubApplication,
  notDeployed: string,
): string {
  return application.activeRelease?.version ?? notDeployed;
}

function translateWithValues(
  translate: ReturnType<typeof useTranslate>,
  key: string,
  fallback: string,
  values: Record<string, string>,
): string {
  const translated = translate(key, values, fallback);
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{{${name}}}`, value),
    translated,
  );
}

export default ApplicationsPage;

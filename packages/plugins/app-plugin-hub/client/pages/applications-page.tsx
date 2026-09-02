import { useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
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
  Settings2,
  Square,
  SquareTerminal,
} from 'lucide-react';
import { useNavigate } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../components/ui/empty.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import {
  NativeSelect,
  NativeSelectOption,
} from '../components/ui/native-select.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js';
import { Textarea } from '../components/ui/textarea.js';
import { useHubApplications } from '../contexts/hub-applications.js';
import {
  createActivity,
  createDeployment,
} from '../domain/applications-data.js';
import type {
  ApplicationRuntimeState,
  HubApplicationRecord,
} from '../domain/applications-data.js';

type ApplicationsView = 'cards' | 'list';
type RuntimeFilter = 'all' | ApplicationRuntimeState;
type PendingAction = 'start' | 'stop' | 'restart' | 'deploy' | 'redeploy';

interface CreateApplicationDraft {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
}

const PAGE_SIZE = 3;

export default function ApplicationsPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { applications, setApplications } = useHubApplications();
  const [search, setSearch] = useState('');
  const [runtimeFilter, setRuntimeFilter] = useState<RuntimeFilter>('all');
  const [view, setView] = useState<ApplicationsView>('cards');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState<{
    readonly applicationId: string;
    readonly action: PendingAction;
  }>();
  const [notice, setNotice] = useState<string>();

  const filteredApplications = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        application.name.toLowerCase().includes(normalizedSearch) ||
        application.slug.toLowerCase().includes(normalizedSearch) ||
        application.description.toLowerCase().includes(normalizedSearch);
      return (
        matchesSearch &&
        (runtimeFilter === 'all' || application.runtimeState === runtimeFilter)
      );
    });
  }, [applications, runtimeFilter, search]);
  const visibleApplications = filteredApplications.slice(0, visibleCount);

  const applyPendingAction = (): void => {
    if (!pending) return;
    const action = pending.action;
    const selectedApplication = applications.find(
      (application) => application.id === pending.applicationId,
    );
    if (!selectedApplication || !canApplyAction(selectedApplication, action)) {
      setPending(undefined);
      return;
    }
    const targetVersion =
      selectedApplication.latestRelease ?? selectedApplication.currentRelease;
    const deployment =
      (action === 'deploy' || action === 'redeploy') && targetVersion
        ? createDeployment(
            targetVersion,
            action === 'redeploy' ? 'redeploy' : 'deploy',
          )
        : undefined;
    const activity = createActivity(
      action === 'start'
        ? 'application.started'
        : action === 'stop'
          ? 'application.stopped'
          : action === 'restart'
            ? 'application.restarted'
            : action === 'redeploy'
              ? 'deployment.redeployed'
              : 'deployment.created',
      action === 'start'
        ? 'Runtime was started from the application list.'
        : action === 'stop'
          ? 'Runtime was stopped from the application list.'
          : action === 'restart'
            ? 'Runtime was restarted from the application list.'
            : `${targetVersion ?? ''} completed successfully.`,
    );
    setApplications((current) =>
      current.map((application) => {
        if (
          application.id !== pending.applicationId ||
          !canApplyAction(application, action)
        ) {
          return application;
        }
        const next = structuredClone(application);
        if (action === 'start') {
          next.runtimeState = 'running';
          next.health = 'healthy';
          next.activity.unshift(activity);
        } else if (action === 'stop') {
          next.runtimeState = 'stopped';
          next.health = 'unknown';
          next.activity.unshift(activity);
        } else if (action === 'restart') {
          next.runtimeState = 'running';
          next.health = 'healthy';
          next.activity.unshift(activity);
        } else if (targetVersion && deployment) {
          next.deployments.unshift(deployment);
          next.currentRelease = targetVersion;
          next.releases = next.releases.map((release) => ({
            ...release,
            active: release.version === targetVersion,
          }));
          next.runtimeState = 'running';
          next.health = 'healthy';
          next.activity.unshift(activity);
        }
        next.updatedAt = new Date().toISOString();
        return next;
      }),
    );
    setNotice(
      t(`applications.actions.${action}.success`, {
        defaultValue:
          action === 'start'
            ? 'Application started'
            : action === 'stop'
              ? 'Application stopped'
              : action === 'restart'
                ? 'Application restarted'
                : action === 'deploy'
                  ? 'Deployment completed'
                  : 'Redeployment completed',
      }),
    );
    setPending(undefined);
  };

  const createApplication = (draft: CreateApplicationDraft): void => {
    const normalizedSlug = draft.slug.trim().toLowerCase();
    const nextApplication: HubApplicationRecord = {
      id: globalThis.crypto.randomUUID(),
      name: draft.name.trim(),
      slug: normalizedSlug,
      description: draft.description.trim(),
      archived: false,
      runtimeState: 'stopped',
      health: 'unknown',
      environment: 'production',
      updatedAt: new Date().toISOString(),
      runtimeSecretRotatedAt: new Date().toISOString(),
      releases: [],
      deployments: [],
      activity: [
        createActivity(
          'application.created',
          'Application was created in this browser session.',
        ),
      ],
      access: [],
    };
    setApplications((current) => [nextApplication, ...current]);
    setSearch('');
    setRuntimeFilter('all');
    setVisibleCount((count) => Math.max(count, PAGE_SIZE + 1));
    setCreateOpen(false);
    setNotice(
      t('applications.create.success', { defaultValue: 'Application created' }),
    );
  };

  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <header className='border-b bg-background px-4 py-7 sm:px-6'>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between'>
          <div className='max-w-3xl'>
            <p className='inline-flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase'>
              <Boxes className='size-3.5' aria-hidden='true' />
              {t('applications.eyebrow', { defaultValue: 'Control plane' })}
            </p>
            <h1 className='mt-1 text-2xl font-semibold tracking-tight'>
              {t('applications.title', { defaultValue: 'Applications' })}
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('applications.description', {
                defaultValue:
                  'Operate application runtimes, releases, and environments from one focused workspace.',
              })}
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() => setCreateOpen(true)}
          >
            <Plus aria-hidden='true' />
            {t('applications.create.button', {
              defaultValue: 'Create application',
            })}
          </Button>
        </div>
      </header>

      <div className='mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6'>
        {notice ? (
          <Alert className='border-primary/25 bg-primary/5'>
            <AlertTitle>
              {t('applications.notice.title', { defaultValue: 'Done' })}
            </AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        <section
          className='rounded-2xl border bg-card p-4 shadow-sm sm:p-5'
          aria-label={t('applications.filters.label', {
            defaultValue: 'Application filters',
          })}
        >
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
            <label className='relative min-w-0 flex-1 lg:max-w-xl'>
              <span className='sr-only'>
                {t('applications.search.label', {
                  defaultValue: 'Search applications',
                })}
              </span>
              <Search
                className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                aria-hidden='true'
              />
              <Input
                type='search'
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                className='h-9 pl-9'
                placeholder={t('applications.search.placeholder', {
                  defaultValue: 'Search by name, slug, or description',
                })}
              />
            </label>
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <Label htmlFor='applications-runtime-filter'>
                {t('applications.filters.status', { defaultValue: 'Status' })}
              </Label>
              <NativeSelect
                id='applications-runtime-filter'
                value={runtimeFilter}
                onChange={(event) => {
                  setRuntimeFilter(event.target.value as RuntimeFilter);
                  setVisibleCount(PAGE_SIZE);
                }}
                className='min-w-40'
              >
                <NativeSelectOption value='all'>
                  {t('applications.filters.all', {
                    defaultValue: 'All statuses',
                  })}
                </NativeSelectOption>
                {(
                  [
                    'running',
                    'idle',
                    'starting',
                    'stopping',
                    'stopped',
                  ] as const
                ).map((state) => (
                  <NativeSelectOption key={state} value={state}>
                    {runtimeLabel(t, state)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className='flex items-center gap-1 rounded-lg border bg-muted/30 p-1 lg:ml-auto'>
              <Button
                type='button'
                size='icon-sm'
                variant={view === 'cards' ? 'secondary' : 'ghost'}
                aria-label={t('applications.views.cards', {
                  defaultValue: 'Card view',
                })}
                aria-pressed={view === 'cards'}
                onClick={() => setView('cards')}
              >
                <Grid2X2 aria-hidden='true' />
              </Button>
              <Button
                type='button'
                size='icon-sm'
                variant={view === 'list' ? 'secondary' : 'ghost'}
                aria-label={t('applications.views.list', {
                  defaultValue: 'List view',
                })}
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                <List aria-hidden='true' />
              </Button>
            </div>
          </div>
        </section>

        {visibleApplications.length === 0 ? (
          <Empty className='min-h-80 border bg-card'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Search aria-hidden='true' />
              </EmptyMedia>
              <EmptyTitle>
                {t('applications.empty.title', {
                  defaultValue: 'No matching applications',
                })}
              </EmptyTitle>
              <EmptyDescription>
                {t('applications.empty.description', {
                  defaultValue:
                    'Try another search term or select a different runtime status.',
                })}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : view === 'cards' ? (
          <div className='grid items-stretch gap-5 md:grid-cols-2 2xl:grid-cols-3'>
            {visibleApplications.map((application) => (
              <ApplicationCard
                key={application.id}
                application={application}
                onAction={(action) =>
                  setPending({ applicationId: application.id, action })
                }
                onNavigate={(target) =>
                  void navigate(
                    `/apps/${encodeURIComponent(application.id)}${target}`,
                  )
                }
                onOpen={() =>
                  setNotice(
                    t('applications.open.demo', {
                      defaultValue:
                        'Demo mode: an application URL would open here.',
                    }),
                  )
                }
              />
            ))}
          </div>
        ) : (
          <ApplicationTable
            applications={visibleApplications}
            onAction={(applicationId, action) =>
              setPending({ applicationId, action })
            }
            onNavigate={(applicationId, target) =>
              void navigate(
                `/apps/${encodeURIComponent(applicationId)}${target}`,
              )
            }
            onOpen={() =>
              setNotice(
                t('applications.open.demo', {
                  defaultValue:
                    'Demo mode: an application URL would open here.',
                }),
              )
            }
          />
        )}

        <div className='flex flex-col gap-3 border-t pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
          <p>
            {t('applications.summary', {
              defaultValue: 'Showing {{visible}} of {{total}} applications',
              visible: visibleApplications.length,
              total: filteredApplications.length,
            })}
          </p>
          {visibleCount < filteredApplications.length ? (
            <Button
              type='button'
              variant='outline'
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              {t('applications.loadMore', { defaultValue: 'Load more' })}
            </Button>
          ) : null}
        </div>

        <CreateApplicationDialog
          open={createOpen}
          existingSlugs={applications.map((application) => application.slug)}
          onOpenChange={setCreateOpen}
          onCreate={createApplication}
        />
        <ConfirmApplicationAction
          pending={pending}
          applicationName={
            pending
              ? applications.find(
                  (application) => application.id === pending.applicationId,
                )?.name
              : undefined
          }
          onCancel={() => setPending(undefined)}
          onConfirm={applyPendingAction}
        />
      </div>
    </main>
  );
}

type Translator = ReturnType<typeof useTranslation>['t'];

function canApplyAction(
  application: HubApplicationRecord,
  action: PendingAction,
): boolean {
  if (application.archived) return false;
  if (action === 'start') return Boolean(application.currentRelease);
  if (action === 'redeploy') return Boolean(application.currentRelease);
  if (action === 'deploy') {
    return Boolean(
      application.latestRelease &&
      application.latestRelease !== application.currentRelease,
    );
  }
  return application.runtimeState === 'running';
}

function runtimeLabel(t: Translator, state: ApplicationRuntimeState): string {
  return t(`applications.status.${state}`, {
    defaultValue:
      state === 'running'
        ? 'Running'
        : state === 'idle'
          ? 'Idle'
          : state === 'starting'
            ? 'Starting'
            : state === 'stopping'
              ? 'Stopping'
              : 'Stopped',
  });
}

function RuntimeBadge({
  state,
}: {
  readonly state: ApplicationRuntimeState;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={state === 'running' ? 'default' : 'secondary'}>
      <span
        className={`size-1.5 rounded-full ${
          state === 'running' ? 'bg-primary-foreground' : 'bg-muted-foreground'
        }`}
        aria-hidden='true'
      />
      {runtimeLabel(t, state)}
    </Badge>
  );
}

function ApplicationCard({
  application,
  onAction,
  onNavigate,
  onOpen,
}: {
  readonly application: HubApplicationRecord;
  readonly onAction: (action: PendingAction) => void;
  readonly onNavigate: (target: string) => void;
  readonly onOpen: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card
      data-application-card
      className='h-full border-transparent bg-card shadow-sm ring-1 ring-border transition duration-200 hover:-translate-y-0.5 hover:shadow-md'
    >
      <CardHeader>
        <div className='flex min-w-0 items-start gap-3'>
          <div className='grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary'>
            <Boxes className='size-5' aria-hidden='true' />
          </div>
          <div className='min-w-0 flex-1'>
            <CardTitle className='truncate'>{application.name}</CardTitle>
            <CardDescription className='mt-1 font-mono text-xs'>
              {application.slug}
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <RuntimeBadge state={application.runtimeState} />
        </CardAction>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-5'>
        <p className='line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground'>
          {application.description ||
            t('applications.description.empty', {
              defaultValue: 'No description provided.',
            })}
        </p>
        <dl className='grid grid-cols-2 gap-4 rounded-xl bg-muted/35 p-4'>
          <ApplicationFact
            label={t('applications.fields.currentRelease', {
              defaultValue: 'Current release',
            })}
            value={
              application.currentRelease ??
              t('applications.release.none', { defaultValue: 'Not deployed' })
            }
          />
          <ApplicationFact
            label={t('applications.fields.latestRelease', {
              defaultValue: 'Latest release',
            })}
            value={application.latestRelease ?? '—'}
          />
          <ApplicationFact
            label={t('applications.fields.environment', {
              defaultValue: 'Environment',
            })}
            value={
              application.environment === 'production'
                ? t('applications.environment.production', {
                    defaultValue: 'Production',
                  })
                : t('applications.environment.staging', {
                    defaultValue: 'Staging',
                  })
            }
          />
          <ApplicationFact
            label={t('applications.fields.health', { defaultValue: 'Health' })}
            value={t(`applications.health.${application.health}`, {
              defaultValue:
                application.health === 'healthy'
                  ? 'Healthy'
                  : application.health === 'degraded'
                    ? 'Degraded'
                    : 'Unknown',
            })}
          />
        </dl>
      </CardContent>
      <CardFooter className='mt-auto flex flex-wrap gap-2'>
        <ApplicationActions
          application={application}
          onAction={onAction}
          onNavigate={onNavigate}
          onOpen={onOpen}
        />
      </CardFooter>
    </Card>
  );
}

function ApplicationFact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='min-w-0'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-1 truncate text-sm font-medium'>{value}</dd>
    </div>
  );
}

function ApplicationTable({
  applications,
  onAction,
  onNavigate,
  onOpen,
}: {
  readonly applications: readonly HubApplicationRecord[];
  readonly onAction: (applicationId: string, action: PendingAction) => void;
  readonly onNavigate: (applicationId: string, target: string) => void;
  readonly onOpen: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card className='py-0'>
      <CardContent className='px-0'>
        <Table className='min-w-[940px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='pl-5'>
                {t('applications.table.application', {
                  defaultValue: 'Application',
                })}
              </TableHead>
              <TableHead>
                {t('applications.fields.status', { defaultValue: 'Status' })}
              </TableHead>
              <TableHead>
                {t('applications.fields.health', { defaultValue: 'Health' })}
              </TableHead>
              <TableHead>
                {t('applications.fields.currentRelease', {
                  defaultValue: 'Current release',
                })}
              </TableHead>
              <TableHead>
                {t('applications.fields.environment', {
                  defaultValue: 'Environment',
                })}
              </TableHead>
              <TableHead className='text-right'>
                {t('applications.table.actions', { defaultValue: 'Actions' })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((application) => (
              <TableRow key={application.id}>
                <TableCell className='pl-5'>
                  <button
                    type='button'
                    className='text-left font-medium underline-offset-4 hover:underline'
                    onClick={() => onNavigate(application.id, '')}
                  >
                    {application.name}
                  </button>
                  <div className='font-mono text-xs text-muted-foreground'>
                    {application.slug}
                  </div>
                </TableCell>
                <TableCell>
                  <RuntimeBadge state={application.runtimeState} />
                </TableCell>
                <TableCell>
                  {t(`applications.health.${application.health}`, {
                    defaultValue:
                      application.health === 'healthy'
                        ? 'Healthy'
                        : application.health === 'degraded'
                          ? 'Degraded'
                          : 'Unknown',
                  })}
                </TableCell>
                <TableCell className='font-mono text-xs'>
                  {application.currentRelease ??
                    t('applications.release.none', {
                      defaultValue: 'Not deployed',
                    })}
                </TableCell>
                <TableCell>
                  {application.environment === 'production'
                    ? t('applications.environment.production', {
                        defaultValue: 'Production',
                      })
                    : t('applications.environment.staging', {
                        defaultValue: 'Staging',
                      })}
                </TableCell>
                <TableCell>
                  <div className='flex justify-end'>
                    <ApplicationActions
                      compact
                      application={application}
                      onAction={(action) => onAction(application.id, action)}
                      onNavigate={(target) =>
                        onNavigate(application.id, target)
                      }
                      onOpen={onOpen}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ApplicationActions({
  application,
  onAction,
  onNavigate,
  onOpen,
  compact = false,
}: {
  readonly application: HubApplicationRecord;
  readonly onAction: (action: PendingAction) => void;
  readonly onNavigate: (target: string) => void;
  readonly onOpen: () => void;
  readonly compact?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const buttonSize = compact ? 'sm' : 'default';
  return (
    <div className='flex flex-wrap gap-2'>
      {!application.archived && application.runtimeState === 'running' ? (
        <Button
          type='button'
          size={buttonSize}
          variant='outline'
          onClick={onOpen}
        >
          <ExternalLink aria-hidden='true' />
          {t('applications.actions.open', { defaultValue: 'Open' })}
        </Button>
      ) : null}
      <Button
        type='button'
        size={buttonSize}
        variant='outline'
        onClick={() => onNavigate('')}
      >
        <Settings2 aria-hidden='true' />
        {t('applications.actions.manage', { defaultValue: 'Manage' })}
      </Button>
      {!application.archived ? (
        <Button
          type='button'
          size={buttonSize}
          variant='outline'
          onClick={() => onNavigate('?tab=development')}
        >
          <SquareTerminal aria-hidden='true' />
          {t('applications.actions.develop', { defaultValue: 'Develop' })}
        </Button>
      ) : null}
      {!application.archived &&
      application.latestRelease &&
      application.latestRelease !== application.currentRelease ? (
        <Button
          type='button'
          size={buttonSize}
          onClick={() => onAction('deploy')}
        >
          <Rocket aria-hidden='true' />
          {t('applications.actions.deploy.label', { defaultValue: 'Deploy' })}
        </Button>
      ) : null}
      {!application.archived && application.runtimeState === 'running' ? (
        <>
          <Button
            type='button'
            size={buttonSize}
            variant='secondary'
            onClick={() => onAction('redeploy')}
          >
            <Rocket aria-hidden='true' />
            {t('applications.actions.redeploy.label', {
              defaultValue: 'Redeploy',
            })}
          </Button>
          <Button
            type='button'
            size={buttonSize}
            variant='outline'
            onClick={() => onAction('restart')}
          >
            <RefreshCw aria-hidden='true' />
            {t('applications.actions.restart.label', {
              defaultValue: 'Restart',
            })}
          </Button>
          <Button
            type='button'
            size={buttonSize}
            variant='outline'
            onClick={() => onAction('stop')}
          >
            <Square aria-hidden='true' />
            {t('applications.actions.stop.label', { defaultValue: 'Stop' })}
          </Button>
        </>
      ) : !application.archived && application.currentRelease ? (
        <Button
          type='button'
          size={buttonSize}
          onClick={() => onAction('start')}
        >
          <Play aria-hidden='true' />
          {t('applications.actions.start.label', { defaultValue: 'Start' })}
        </Button>
      ) : null}
    </div>
  );
}

function CreateApplicationDialog({
  open,
  existingSlugs,
  onOpenChange,
  onCreate,
}: {
  readonly open: boolean;
  readonly existingSlugs: readonly string[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreate: (draft: CreateApplicationDraft) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string>();
  const reset = (): void => {
    setName('');
    setSlug('');
    setDescription('');
    setError(undefined);
  };
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmedName = name.trim();
    const normalizedSlug = slug.trim().toLowerCase();
    if (!trimmedName) {
      setError(
        t('applications.create.errors.name', {
          defaultValue: 'Enter an application name.',
        }),
      );
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
      setError(
        t('applications.create.errors.slug', {
          defaultValue:
            'Use lowercase letters, numbers, and single hyphens for the slug.',
        }),
      );
      return;
    }
    if (existingSlugs.includes(normalizedSlug)) {
      setError(
        t('applications.create.errors.duplicate', {
          defaultValue: 'This slug is already in use.',
        }),
      );
      return;
    }
    onCreate({ name: trimmedName, slug: normalizedSlug, description });
    reset();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <form className='space-y-4' onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>
              {t('applications.create.title', {
                defaultValue: 'Create application',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('applications.create.description', {
                defaultValue:
                  'Create an empty Hub application and connect its first release later.',
              })}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant='destructive'>
              <AlertTitle>
                {t('applications.create.invalid', {
                  defaultValue: 'Check application details',
                })}
              </AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className='space-y-2'>
            <Label htmlFor='application-create-name'>
              {t('applications.create.fields.name', { defaultValue: 'Name' })}
            </Label>
            <Input
              id='application-create-name'
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='application-create-slug'>
              {t('applications.create.fields.slug', { defaultValue: 'Slug' })}
            </Label>
            <Input
              id='application-create-slug'
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder={t('applications.create.fields.slugPlaceholder', {
                defaultValue: 'support-portal',
              })}
              aria-describedby='application-create-slug-help'
            />
            <p
              id='application-create-slug-help'
              className='text-xs text-muted-foreground'
            >
              {t('applications.create.fields.slugHelp', {
                defaultValue:
                  'The slug is a stable identifier and cannot be changed later.',
              })}
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='application-create-description'>
              {t('applications.create.fields.description', {
                defaultValue: 'Description',
              })}
            </Label>
            <Textarea
              id='application-create-description'
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type='submit'>
              {t('applications.create.submit', { defaultValue: 'Create' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmApplicationAction({
  pending,
  applicationName,
  onCancel,
  onConfirm,
}: {
  readonly pending:
    | { readonly applicationId: string; readonly action: PendingAction }
    | undefined;
  readonly applicationName: string | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = pending?.action ?? 'start';
  const actionLabel = t(`applications.actions.${action}.label`, {
    defaultValue:
      action === 'start'
        ? 'Start'
        : action === 'stop'
          ? 'Stop'
          : action === 'restart'
            ? 'Restart'
            : action === 'deploy'
              ? 'Deploy'
              : 'Redeploy',
  });
  return (
    <AlertDialog
      open={Boolean(pending)}
      onOpenChange={(open) => !open && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('applications.confirm.title', {
              defaultValue: '{{action}} application?',
              action: actionLabel,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('applications.confirm.description', {
              defaultValue:
                'This demo changes {{name}} only for the current browser session.',
              name: applicationName ?? '',
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t(`applications.actions.${action}.confirm`, {
              defaultValue:
                action === 'start'
                  ? 'Confirm start'
                  : action === 'stop'
                    ? 'Confirm stop'
                    : action === 'restart'
                      ? 'Confirm restart'
                      : action === 'deploy'
                        ? 'Confirm deployment'
                        : 'Confirm redeployment',
            })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

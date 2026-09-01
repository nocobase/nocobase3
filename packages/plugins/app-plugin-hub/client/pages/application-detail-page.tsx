import { useState } from 'react';
import type { ReactElement } from 'react';
import { resolveAppBase } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  Activity,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  PackageCheck,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Square,
  SquareTerminal,
} from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs.js';
import { Textarea } from '../components/ui/textarea.js';
import { useHubApplications } from '../contexts/hub-applications.js';
import {
  createActivity,
  createDeployment,
} from '../domain/applications-data.js';
import type {
  ApplicationRuntimeState,
  HubApplicationAccess,
  HubApplicationRecord,
  HubApplicationRelease,
} from '../domain/applications-data.js';

type DetailTab =
  | 'overview'
  | 'development'
  | 'releases'
  | 'deployments'
  | 'activity'
  | 'permissions'
  | 'settings';

type DetailAction =
  | { readonly kind: 'runtime'; readonly action: 'start' | 'stop' | 'restart' }
  | {
      readonly kind: 'release';
      readonly action: 'deploy' | 'rollback' | 'redeploy';
      readonly version: string;
    };

const DETAIL_TABS: readonly DetailTab[] = [
  'overview',
  'development',
  'releases',
  'deployments',
  'activity',
  'permissions',
  'settings',
];

export default function ApplicationDetailPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { appId } = useParams<{ appId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { applications, setApplications } = useHubApplications();
  const application = appId
    ? applications.find((candidate) => candidate.id === appId)
    : undefined;
  const [pendingAction, setPendingAction] = useState<DetailAction>();
  const [selectedRelease, setSelectedRelease] =
    useState<HubApplicationRelease>();
  const [authorizationOpen, setAuthorizationOpen] = useState(false);
  const [notice, setNotice] = useState<string>();
  const requestedTab = searchParams.get('tab');
  const availableTabs = application?.archived
    ? DETAIL_TABS.filter((tab) => tab !== 'development')
    : DETAIL_TABS;
  const activeTab: DetailTab = availableTabs.includes(requestedTab as DetailTab)
    ? (requestedTab as DetailTab)
    : 'overview';

  if (!application) {
    return (
      <main className='mx-auto grid min-h-[60svh] w-full max-w-3xl place-items-center p-6'>
        <Card className='w-full text-center'>
          <CardHeader>
            <CardTitle>
              {t('applicationDetail.notFound.title', {
                defaultValue: 'Application not found',
              })}
            </CardTitle>
            <CardDescription>
              {t('applicationDetail.notFound.description', {
                defaultValue: 'The requested demo application does not exist.',
              })}
            </CardDescription>
          </CardHeader>
          <CardFooter className='justify-center'>
            <Button
              type='button'
              variant='outline'
              onClick={() => void navigate('/apps')}
            >
              <ArrowLeft aria-hidden='true' />
              {t('applicationDetail.back', {
                defaultValue: 'Back to applications',
              })}
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  const updateApplication = (
    update: (draft: HubApplicationRecord) => void,
  ): void => {
    if (!appId) return;
    const updatedAt = new Date().toISOString();
    setApplications((current) =>
      current.map((candidate) => {
        if (candidate.id !== appId) return candidate;
        const draft = structuredClone(candidate);
        update(draft);
        draft.updatedAt = updatedAt;
        return draft;
      }),
    );
  };

  const confirmAction = (): void => {
    if (!pendingAction) return;
    if (pendingAction.kind === 'runtime') {
      if (!canPerformRuntimeAction(application, pendingAction.action)) {
        setPendingAction(undefined);
        return;
      }
      const action = pendingAction.action;
      const activity = createActivity(
        `application.${
          action === 'start'
            ? 'started'
            : action === 'stop'
              ? 'stopped'
              : 'restarted'
        }`,
        `Runtime ${action} completed in this browser session.`,
      );
      updateApplication((draft) => {
        if (!canPerformRuntimeAction(draft, action)) return;
        draft.runtimeState = action === 'stop' ? 'stopped' : 'running';
        draft.health = action === 'stop' ? 'unknown' : 'healthy';
        draft.activity.unshift(activity);
      });
      setNotice(
        t(`applicationDetail.runtime.${pendingAction.action}.success`, {
          defaultValue:
            pendingAction.action === 'start'
              ? 'Runtime started'
              : pendingAction.action === 'stop'
                ? 'Runtime stopped'
                : 'Runtime restarted',
        }),
      );
    } else if (pendingAction.kind === 'release') {
      const { action, version } = pendingAction;
      if (!canPerformReleaseAction(application, action, version)) {
        setPendingAction(undefined);
        return;
      }
      const deployment = createDeployment(version, action);
      const activity = createActivity(
        `deployment.${action === 'redeploy' ? 'redeployed' : action === 'rollback' ? 'rolledBack' : 'created'}`,
        `${version} completed successfully.`,
      );
      updateApplication((draft) => {
        if (!canPerformReleaseAction(draft, action, version)) return;
        draft.currentRelease = version;
        draft.latestRelease ??= version;
        draft.releases = draft.releases.map((release) => ({
          ...release,
          active: release.version === version,
        }));
        draft.deployments.unshift(deployment);
        draft.runtimeState = 'running';
        draft.health = 'healthy';
        draft.activity.unshift(activity);
      });
      setNotice(
        t(`applicationDetail.releases.${action}.success`, {
          defaultValue:
            action === 'deploy'
              ? 'Release deployed'
              : action === 'rollback'
                ? 'Rollback completed'
                : 'Release redeployed',
        }),
      );
    }
    setPendingAction(undefined);
  };

  const openDemo = (): void => {
    setNotice(
      t('applicationDetail.open.demo', {
        defaultValue: 'Demo mode: an application URL would open here.',
      }),
    );
  };

  return (
    <main className='mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8'>
      <header className='relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm sm:p-7'>
        <div className='pointer-events-none absolute -top-28 -right-20 size-72 rounded-full bg-primary/10 blur-3xl' />
        <div className='relative space-y-5'>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            onClick={() => void navigate('/apps')}
          >
            <ArrowLeft aria-hidden='true' />
            {t('applicationDetail.back', {
              defaultValue: 'Back to applications',
            })}
          </Button>
          <div className='flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between'>
            <div className='min-w-0 space-y-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
                  {application.name}
                </h1>
                <RuntimeBadge state={application.runtimeState} />
                {application.archived ? (
                  <Badge variant='outline'>
                    {t('applicationDetail.archived', {
                      defaultValue: 'Archived',
                    })}
                  </Badge>
                ) : null}
              </div>
              <p className='font-mono text-xs text-muted-foreground'>
                {application.slug}
              </p>
              <p className='max-w-2xl text-sm leading-6 text-muted-foreground'>
                {application.description}
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button type='button' variant='outline' onClick={openDemo}>
                <ExternalLink aria-hidden='true' />
                {t('applicationDetail.open', {
                  defaultValue: 'Open application',
                })}
              </Button>
              {!application.archived ? (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setSearchParams({ tab: 'development' })}
                >
                  <SquareTerminal aria-hidden='true' />
                  {t('applicationDetail.develop', { defaultValue: 'Develop' })}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {notice ? (
        <Alert className='border-primary/25 bg-primary/5'>
          <Check aria-hidden='true' />
          <AlertTitle>
            {t('applicationDetail.notice.title', { defaultValue: 'Done' })}
          </AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const nextTab = value as DetailTab;
          setSearchParams(nextTab === 'overview' ? {} : { tab: nextTab });
        }}
      >
        <TabsList
          variant='line'
          className='w-full justify-start rounded-none border-b bg-transparent p-0'
          aria-label={t('applicationDetail.tabs.label', {
            defaultValue: 'Application sections',
          })}
        >
          {availableTabs.map((tab) => (
            <TabsTrigger key={tab} value={tab} className='h-10 flex-none px-3'>
              {tabLabel(t, tab)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value='overview'>
          <OverviewTab
            application={application}
            onOpen={openDemo}
            onRuntimeAction={(action) =>
              setPendingAction({ kind: 'runtime', action })
            }
            onTab={(tab) => setSearchParams({ tab })}
          />
        </TabsContent>
        <TabsContent value='development'>
          <DevelopmentTab application={application} />
        </TabsContent>
        <TabsContent value='releases'>
          <ReleasesTab
            application={application}
            onDetails={setSelectedRelease}
            onReleaseAction={(action, version) =>
              setPendingAction({ kind: 'release', action, version })
            }
            actionsEnabled={!application.archived}
          />
        </TabsContent>
        <TabsContent value='deployments'>
          <DeploymentsTab application={application} />
        </TabsContent>
        <TabsContent value='activity'>
          <ActivityTab application={application} />
        </TabsContent>
        <TabsContent value='permissions'>
          <PermissionsTab
            application={application}
            onAdd={() => setAuthorizationOpen(true)}
            onRoleChange={(accessId, role) => {
              const activity = createActivity(
                'permission.updated',
                'Application authorization role was updated.',
              );
              updateApplication((draft) => {
                draft.access = draft.access.map((access) =>
                  access.id === accessId ? { ...access, role } : access,
                );
                draft.activity.unshift(activity);
              });
            }}
            onRemove={(accessId) => {
              const activity = createActivity(
                'permission.removed',
                'Application authorization was removed.',
              );
              updateApplication((draft) => {
                draft.access = draft.access.filter(
                  (access) => access.id !== accessId,
                );
                draft.activity.unshift(activity);
              });
            }}
          />
        </TabsContent>
        <TabsContent value='settings'>
          <SettingsTab
            application={application}
            onSave={(name, description) => {
              const activity = createActivity(
                'application.updated',
                'Application profile was updated.',
              );
              updateApplication((draft) => {
                draft.name = name;
                draft.description = description;
                draft.activity.unshift(activity);
              });
              setNotice(
                t('applicationDetail.settings.profile.saved', {
                  defaultValue: 'Application details saved',
                }),
              );
            }}
          />
        </TabsContent>
      </Tabs>

      <ReleaseDetailsDialog
        release={
          selectedRelease
            ? application.releases.find(
                (release) => release.id === selectedRelease.id,
              )
            : undefined
        }
        onClose={() => setSelectedRelease(undefined)}
        onPin={(releaseId) => {
          const changed = application.releases.find(
            (release) => release.id === releaseId,
          );
          const willPin = !changed?.pinned;
          const activity = createActivity(
            willPin ? 'release.pinned' : 'release.unpinned',
            `${changed?.version ?? ''} pin setting was updated.`,
          );
          updateApplication((draft) => {
            draft.releases = draft.releases.map((release) => ({
              ...release,
              pinned: release.id === releaseId ? willPin : release.pinned,
            }));
            draft.activity.unshift(activity);
          });
        }}
      />
      <AuthorizationDialog
        open={authorizationOpen}
        existingMemberIds={application.access.map((access) => access.memberId)}
        onOpenChange={setAuthorizationOpen}
        onAdd={(access) => {
          const activity = createActivity(
            'permission.assigned',
            `${access.memberName} received application access.`,
          );
          updateApplication((draft) => {
            draft.access.push(access);
            draft.activity.unshift(activity);
          });
          setAuthorizationOpen(false);
        }}
      />
      <ConfirmDetailAction
        action={pendingAction}
        applicationName={application.name}
        onCancel={() => setPendingAction(undefined)}
        onConfirm={confirmAction}
      />
    </main>
  );
}

type Translator = ReturnType<typeof useTranslation>['t'];

function canPerformRuntimeAction(
  application: HubApplicationRecord,
  action: 'start' | 'stop' | 'restart',
): boolean {
  if (application.archived) return false;
  if (action === 'start') {
    return (
      Boolean(application.currentRelease) &&
      application.runtimeState !== 'running'
    );
  }
  return application.runtimeState === 'running';
}

function canPerformReleaseAction(
  application: HubApplicationRecord,
  action: 'deploy' | 'rollback' | 'redeploy',
  version: string,
): boolean {
  if (application.archived) return false;
  if (!application.releases.some((release) => release.version === version)) {
    return false;
  }
  return action !== 'redeploy' || Boolean(application.currentRelease);
}

function tabLabel(t: Translator, tab: DetailTab): string {
  return t(`applicationDetail.tabs.${tab}`, {
    defaultValue:
      tab === 'overview'
        ? 'Overview'
        : tab === 'development'
          ? 'Development'
          : tab === 'releases'
            ? 'Releases'
            : tab === 'deployments'
              ? 'Deployments'
              : tab === 'activity'
                ? 'Activity'
                : tab === 'permissions'
                  ? 'Permissions'
                  : 'Settings',
  });
}

function runtimeLabel(t: Translator, state: ApplicationRuntimeState): string {
  return t(`applicationDetail.runtime.${state}`, {
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
      {runtimeLabel(t, state)}
    </Badge>
  );
}

function OverviewTab({
  application,
  onOpen,
  onRuntimeAction,
  onTab,
}: {
  readonly application: HubApplicationRecord;
  readonly onOpen: () => void;
  readonly onRuntimeAction: (action: 'start' | 'stop' | 'restart') => void;
  readonly onTab: (tab: Exclude<DetailTab, 'overview'>) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='grid gap-5 pt-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]'>
      <div className='space-y-5'>
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          <MetricCard
            icon={<PackageCheck aria-hidden='true' />}
            label={t('applicationDetail.overview.activeRelease', {
              defaultValue: 'Active release',
            })}
            value={
              application.currentRelease ??
              t('applicationDetail.overview.notDeployed', {
                defaultValue: 'Not deployed',
              })
            }
          />
          <MetricCard
            icon={<Activity aria-hidden='true' />}
            label={t('applicationDetail.overview.runtime', {
              defaultValue: 'Runtime',
            })}
            value={runtimeLabel(t, application.runtimeState)}
          />
          <MetricCard
            icon={<ShieldCheck aria-hidden='true' />}
            label={t('applicationDetail.overview.health', {
              defaultValue: 'Health',
            })}
            value={t(`applicationDetail.health.${application.health}`, {
              defaultValue:
                application.health === 'healthy'
                  ? 'Healthy'
                  : application.health === 'degraded'
                    ? 'Degraded'
                    : 'Unknown',
            })}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              {t('applicationDetail.overview.operations', {
                defaultValue: 'Operations',
              })}
            </CardTitle>
            <CardDescription>
              {t('applicationDetail.overview.operationsDescription', {
                defaultValue:
                  'Common runtime and release actions for this application.',
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-wrap gap-2'>
            {!application.archived && application.runtimeState === 'running' ? (
              <Button type='button' variant='outline' onClick={onOpen}>
                <ExternalLink aria-hidden='true' />
                {t('applicationDetail.open', {
                  defaultValue: 'Open application',
                })}
              </Button>
            ) : null}
            {!application.archived ? (
              <Button
                type='button'
                variant='outline'
                onClick={() => onTab('development')}
              >
                <SquareTerminal aria-hidden='true' />
                {t('applicationDetail.develop', { defaultValue: 'Develop' })}
              </Button>
            ) : null}
            <Button
              type='button'
              variant='outline'
              onClick={() => onTab('releases')}
            >
              <Rocket aria-hidden='true' />
              {t('applicationDetail.overview.releases', {
                defaultValue: 'Manage releases',
              })}
            </Button>
            {application.archived ? null : application.runtimeState ===
              'running' ? (
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => onRuntimeAction('restart')}
                >
                  <RefreshCw aria-hidden='true' />
                  {t('applicationDetail.runtime.restart', {
                    defaultValue: 'Restart',
                  })}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => onRuntimeAction('stop')}
                >
                  <Square aria-hidden='true' />
                  {t('applicationDetail.runtime.stop', {
                    defaultValue: 'Stop',
                  })}
                </Button>
              </>
            ) : application.currentRelease ? (
              <Button type='button' onClick={() => onRuntimeAction('start')}>
                <Play aria-hidden='true' />
                {t('applicationDetail.runtime.start', {
                  defaultValue: 'Start',
                })}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {t('applicationDetail.overview.recent', {
              defaultValue: 'Recent activity',
            })}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {application.activity.slice(0, 5).map((event) => (
            <div
              key={event.id}
              className='flex gap-3 border-b pb-3 last:border-0 last:pb-0'
            >
              <span
                className='mt-1 size-2 shrink-0 rounded-full bg-primary'
                aria-hidden='true'
              />
              <div className='min-w-0'>
                <p className='font-medium'>{event.action}</p>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {event.details}
                </p>
              </div>
            </div>
          ))}
          {application.activity.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('applicationDetail.overview.noActivity', {
                defaultValue: 'No activity yet.',
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  readonly icon: ReactElement;
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <Card>
      <CardHeader className='grid grid-cols-[auto_1fr] items-center gap-x-3'>
        <div className='row-span-2 grid size-9 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-4'>
          {icon}
        </div>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function DevelopmentTab({
  application,
}: {
  readonly application: HubApplicationRecord;
}): ReactElement {
  const { t } = useTranslation();
  const hubUrl = resolveHubPublicUrl();
  const createCommands = `pnpm config set @nocobase:registry https://npm.nocobase.ai/
pnpm create @nocobase/app ${application.slug}
cd ${application.slug}
pnpm dev`;
  const existingCommands = `cd <existing-app-directory>
pnpm install
pnpm dev`;
  const firstDeploymentCommand = `pnpm run deploy --hub ${hubUrl} --app ${application.slug}`;

  return (
    <article className='max-w-3xl px-1 py-2 sm:px-4'>
      <header className='space-y-2 pb-7'>
        <h2 className='text-2xl font-semibold tracking-tight'>
          {t('applicationDetail.development.title', {
            defaultValue: 'Quick setup',
          })}
        </h2>
        <p className='text-sm leading-6 text-muted-foreground'>
          {t('applicationDetail.development.description', {
            defaultValue:
              'Develop the APP locally, then deploy its build artifact to this Hub application.',
          })}
        </p>
      </header>

      <section className='space-y-7 border-t border-border/70 py-8'>
        <h3 className='text-xl font-semibold tracking-tight'>
          {t('applicationDetail.development.local.title', {
            defaultValue: 'Development',
          })}
        </h3>

        <div className='space-y-3'>
          <h4 className='font-semibold'>
            {t('applicationDetail.development.create.title', {
              defaultValue: 'No local APP source',
            })}
          </h4>
          <p className='text-sm leading-6 text-muted-foreground'>
            {t('applicationDetail.development.create.description', {
              defaultValue:
                'Create an APP from the default template and start development.',
            })}
          </p>
          <DevelopmentCommandBlock
            commands={createCommands}
            copyLabel={t('applicationDetail.development.create.copy', {
              defaultValue: 'Copy create APP commands',
            })}
          />
        </div>

        <div className='space-y-3'>
          <h4 className='font-semibold'>
            {t('applicationDetail.development.existing.title', {
              defaultValue: 'Existing local APP source',
            })}
          </h4>
          <p className='text-sm leading-6 text-muted-foreground'>
            {t('applicationDetail.development.existing.description', {
              defaultValue:
                'Enter the source directory, install dependencies, and start development.',
            })}
          </p>
          <DevelopmentCommandBlock
            commands={existingCommands}
            copyLabel={t('applicationDetail.development.existing.copy', {
              defaultValue: 'Copy existing APP commands',
            })}
          />
        </div>
      </section>

      <section className='space-y-4 border-t border-border/70 pt-8'>
        <h3 className='text-xl font-semibold tracking-tight'>
          {t('applicationDetail.development.deploy.title', {
            defaultValue: 'Deploy to this Hub',
          })}
        </h3>
        <p className='text-sm leading-6 text-muted-foreground'>
          {t('applicationDetail.development.deploy.description', {
            defaultValue:
              'Run this command in the APP source directory. It builds the APP, creates a Release, and deploys it to the current Hub application.',
          })}
        </p>
        <DevelopmentCommandBlock
          commands={firstDeploymentCommand}
          copyLabel={t('applicationDetail.development.deploy.copy', {
            defaultValue: 'Copy deployment command',
          })}
        />
        <p className='text-sm leading-6 text-muted-foreground'>
          {t('applicationDetail.development.deploy.nextDescription', {
            defaultValue: 'After the first successful deployment, run',
          })}{' '}
          <code className='rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground'>
            pnpm run deploy
          </code>
          {t('applicationDetail.development.deploy.nextSuffix', {
            defaultValue: ' next time.',
          })}
        </p>
      </section>
    </article>
  );
}

function DevelopmentCommandBlock({
  commands,
  copyLabel,
}: {
  readonly commands: string;
  readonly copyLabel: string;
}): ReactElement {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  return (
    <div className='relative rounded-lg border bg-muted/45 shadow-sm'>
      <pre className='overflow-x-auto p-4 pr-12 font-mono text-xs leading-6'>
        {commands}
      </pre>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        className='absolute top-2 right-2'
        aria-label={
          copied
            ? t('applicationDetail.development.copied', {
                defaultValue: 'Copied',
              })
            : copyLabel
        }
        title={copyLabel}
        onClick={() => {
          void copyText(commands).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
          });
        }}
      >
        {copied ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
      </Button>
    </div>
  );
}

function resolveHubPublicUrl(): string {
  const appBase = resolveAppBase();
  if (typeof window === 'undefined') {
    return appBase.replace(/\/$/u, '') || '/';
  }
  return new URL(appBase, window.location.origin)
    .toString()
    .replace(/\/$/u, '');
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function ReleasesTab({
  application,
  onDetails,
  onReleaseAction,
  actionsEnabled,
}: {
  readonly application: HubApplicationRecord;
  readonly onDetails: (release: HubApplicationRelease) => void;
  readonly onReleaseAction: (
    action: 'deploy' | 'rollback' | 'redeploy',
    version: string,
  ) => void;
  readonly actionsEnabled: boolean;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <Card className='mt-5 py-0'>
      <CardContent className='px-0'>
        <Table className='min-w-[720px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='pl-4'>
                {t('applicationDetail.releases.version', {
                  defaultValue: 'Version',
                })}
              </TableHead>
              <TableHead>
                {t('applicationDetail.releases.verification', {
                  defaultValue: 'Verification',
                })}
              </TableHead>
              <TableHead>
                {t('applicationDetail.releases.sizeColumn', {
                  defaultValue: 'Size',
                })}
              </TableHead>
              <TableHead>
                {t('applicationDetail.releases.publisher', {
                  defaultValue: 'Published by',
                })}
              </TableHead>
              <TableHead>
                {t('applicationDetail.releases.created', {
                  defaultValue: 'Created',
                })}
              </TableHead>
              <TableHead className='text-right'>
                {t('applicationDetail.releases.actions', {
                  defaultValue: 'Action',
                })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {application.releases.map((release) => {
              const releaseAction = release.active
                ? 'redeploy'
                : release.version === application.latestRelease
                  ? 'deploy'
                  : 'rollback';
              return (
                <TableRow key={release.id}>
                  <TableCell className='pl-4 font-medium'>
                    <div className='flex items-center gap-2'>
                      <Button
                        type='button'
                        variant='link'
                        className='h-auto p-0 font-mono font-medium'
                        aria-label={t(
                          'applicationDetail.releases.detailsAria',
                          {
                            defaultValue: `View version ${release.version} details`,
                            version: release.version,
                          },
                        )}
                        onClick={() => onDetails(release)}
                      >
                        {release.version}
                      </Button>
                      {release.active ? (
                        <Badge variant='outline'>
                          {t('applicationDetail.releases.active', {
                            defaultValue: 'Current',
                          })}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge>
                      {t('applicationDetail.releases.verified', {
                        defaultValue: 'Verified',
                      })}
                    </Badge>
                  </TableCell>
                  <TableCell>{release.size}</TableCell>
                  <TableCell>{release.createdBy}</TableCell>
                  <TableCell>{formatDate(release.createdAt, locale)}</TableCell>
                  <TableCell className='text-right'>
                    {actionsEnabled ? (
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={() =>
                          onReleaseAction(releaseAction, release.version)
                        }
                      >
                        {t(
                          releaseAction === 'rollback'
                            ? 'applicationDetail.releases.deployOrRollback'
                            : `applicationDetail.releases.${releaseAction}`,
                          {
                            defaultValue:
                              releaseAction === 'deploy'
                                ? 'Deploy'
                                : releaseAction === 'rollback'
                                  ? 'Deploy / roll back'
                                  : 'Redeploy',
                          },
                        )}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DeploymentsTab({
  application,
}: {
  readonly application: HubApplicationRecord;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <Card className='mt-5 py-0'>
      <CardContent className='px-0'>
        <Table className='min-w-[880px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='pl-4'>
                {t('applicationDetail.deployments.id', {
                  defaultValue: 'Deployment',
                })}
              </TableHead>
              <TableHead>
                {t('applicationDetail.deployments.type', {
                  defaultValue: 'Type',
                })}
              </TableHead>
              <TableHead>
                {t('applicationDetail.deployments.release', {
                  defaultValue: 'Version',
                })}
              </TableHead>
              <TableHead>
                {t('applicationDetail.deployments.status', {
                  defaultValue: 'Status',
                })}
              </TableHead>
              <TableHead>
                {t('applicationDetail.deployments.actor', {
                  defaultValue: 'Initiated by',
                })}
              </TableHead>
              <TableHead>
                {t('applicationDetail.deployments.started', {
                  defaultValue: 'Start time',
                })}
              </TableHead>
              <TableHead className='pr-4 text-right'>
                {t('applicationDetail.deployments.duration', {
                  defaultValue: 'Duration',
                })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {application.deployments.map((deployment) => (
              <TableRow key={deployment.id}>
                <TableCell className='pl-4 font-medium'>
                  <Link
                    className='underline-offset-4 hover:underline'
                    to={`/deployments/${encodeURIComponent(deployment.id)}`}
                  >
                    {deployment.id}
                  </Link>
                </TableCell>
                <TableCell>
                  {t(`applicationDetail.deployments.type.${deployment.type}`, {
                    defaultValue:
                      deployment.type === 'deploy'
                        ? 'Deploy'
                        : deployment.type === 'rollback'
                          ? 'Rollback'
                          : 'Redeploy',
                  })}
                </TableCell>
                <TableCell className='font-mono text-xs'>
                  {deployment.version}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      deployment.status === 'succeeded'
                        ? 'default'
                        : deployment.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {deployment.status === 'succeeded' ? (
                      <Check aria-hidden='true' />
                    ) : null}
                    {t(
                      `applicationDetail.deployments.status.${deployment.status}`,
                      {
                        defaultValue:
                          deployment.status === 'succeeded'
                            ? 'Succeeded'
                            : deployment.status === 'failed'
                              ? 'Failed'
                              : deployment.status === 'running'
                                ? 'Running'
                                : 'Queued',
                      },
                    )}
                  </Badge>
                </TableCell>
                <TableCell>{deployment.actor}</TableCell>
                <TableCell>
                  {formatDate(deployment.createdAt, locale)}
                </TableCell>
                <TableCell className='pr-4 text-right'>
                  {t('applicationDetail.deployments.durationSeconds', {
                    defaultValue: '0 s',
                    count: 0,
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {application.deployments.length === 0 ? (
          <p className='p-8 text-center text-sm text-muted-foreground'>
            {t('applicationDetail.deployments.empty', {
              defaultValue: 'No deployments yet.',
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActivityTab({
  application,
}: {
  readonly application: HubApplicationRecord;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <div className='space-y-4 pt-5'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>
            {t('applicationDetail.activity.title', {
              defaultValue: 'Operation activity',
            })}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('applicationDetail.activity.description', {
              defaultValue: 'A local audit trail for this application page.',
            })}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          onClick={() =>
            downloadCsv(
              `${application.slug}-activity.csv`,
              ['id', 'action', 'actor', 'result', 'createdAt'],
              application.activity.map((event) => [
                event.id,
                event.action,
                event.actor,
                event.result,
                event.createdAt,
              ]),
            )
          }
        >
          <Download aria-hidden='true' />
          {t('applicationDetail.activity.export', {
            defaultValue: 'Export CSV',
          })}
        </Button>
      </div>
      <Card className='py-0'>
        <CardContent className='px-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('applicationDetail.activity.action', {
                    defaultValue: 'Action',
                  })}
                </TableHead>
                <TableHead>
                  {t('applicationDetail.activity.actor', {
                    defaultValue: 'Actor',
                  })}
                </TableHead>
                <TableHead>
                  {t('applicationDetail.activity.result', {
                    defaultValue: 'Result',
                  })}
                </TableHead>
                <TableHead>
                  {t('applicationDetail.activity.time', {
                    defaultValue: 'Time',
                  })}
                </TableHead>
                <TableHead>
                  {t('applicationDetail.activity.details', {
                    defaultValue: 'Details',
                  })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {application.activity.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className='font-medium'>{event.action}</TableCell>
                  <TableCell>{event.actor}</TableCell>
                  <TableCell>
                    <Badge variant='secondary'>
                      {t('applicationDetail.activity.success', {
                        defaultValue: 'Success',
                      })}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(event.createdAt, locale)}</TableCell>
                  <TableCell className='max-w-md whitespace-normal text-muted-foreground'>
                    {event.details}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function downloadCsv(
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): void {
  const escape = (value: string): string => `"${value.replaceAll('"', '""')}"`;
  const csv = [headers, ...rows]
    .map((row) => row.map(escape).join(','))
    .join('\n');
  const anchor = document.createElement('a');
  anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function PermissionsTab({
  application,
  onAdd,
  onRoleChange,
  onRemove,
}: {
  readonly application: HubApplicationRecord;
  readonly onAdd: () => void;
  readonly onRoleChange: (
    accessId: string,
    role: HubApplicationAccess['role'],
  ) => void;
  readonly onRemove: (accessId: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='space-y-4 pt-5'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>
            {t('applicationDetail.permissions.title', {
              defaultValue: 'Application access',
            })}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('applicationDetail.permissions.description', {
              defaultValue: 'Assign application-scoped roles to Hub members.',
            })}
          </p>
        </div>
        <Button type='button' onClick={onAdd}>
          <Plus aria-hidden='true' />
          {t('applicationDetail.permissions.add', {
            defaultValue: 'Add authorization',
          })}
        </Button>
      </div>
      <Card className='py-0'>
        <CardContent className='px-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('applicationDetail.permissions.member', {
                    defaultValue: 'Member',
                  })}
                </TableHead>
                <TableHead>
                  {t('applicationDetail.permissions.role', {
                    defaultValue: 'Role',
                  })}
                </TableHead>
                <TableHead className='text-right'>
                  {t('applicationDetail.permissions.actions', {
                    defaultValue: 'Actions',
                  })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {application.access.map((access) => (
                <TableRow key={access.id}>
                  <TableCell className='font-medium'>
                    {access.memberName}
                  </TableCell>
                  <TableCell>
                    <NativeSelect
                      value={access.role}
                      aria-label={t('applicationDetail.permissions.roleAria', {
                        defaultValue: 'Role for {{name}}',
                        name: access.memberName,
                      })}
                      onChange={(event) =>
                        onRoleChange(
                          access.id,
                          event.target.value as HubApplicationAccess['role'],
                        )
                      }
                    >
                      <NativeSelectOption value='viewer'>
                        {t('applicationDetail.permissions.roles.viewer', {
                          defaultValue: 'Viewer',
                        })}
                      </NativeSelectOption>
                      <NativeSelectOption value='operator'>
                        {t('applicationDetail.permissions.roles.operator', {
                          defaultValue: 'Operator',
                        })}
                      </NativeSelectOption>
                      <NativeSelectOption value='administrator'>
                        {t(
                          'applicationDetail.permissions.roles.administrator',
                          { defaultValue: 'Administrator' },
                        )}
                      </NativeSelectOption>
                    </NativeSelect>
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => onRemove(access.id)}
                    >
                      {t('applicationDetail.permissions.remove', {
                        defaultValue: 'Remove',
                      })}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab({
  application,
  onSave,
}: {
  readonly application: HubApplicationRecord;
  readonly onSave: (name: string, description: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState(application.name);
  const [description, setDescription] = useState(application.description);
  return (
    <div className='pt-5'>
      <Card className='max-w-3xl'>
        <CardHeader>
          <CardTitle>
            {t('applicationDetail.settings.profile.title', {
              defaultValue: 'Application profile',
            })}
          </CardTitle>
          <CardDescription>
            {t('applicationDetail.settings.profile.description', {
              defaultValue: 'Update display details for this application.',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className='space-y-4'
            onSubmit={(event) => {
              event.preventDefault();
              onSave(name.trim(), description.trim());
            }}
          >
            <div className='space-y-2'>
              <Label htmlFor='application-settings-name'>
                {t('applicationDetail.settings.profile.name', {
                  defaultValue: 'Application name',
                })}
              </Label>
              <Input
                id='application-settings-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='application-settings-slug'>
                {t('applicationDetail.settings.profile.slug', {
                  defaultValue: 'Slug',
                })}
              </Label>
              <Input
                id='application-settings-slug'
                value={application.slug}
                disabled
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='application-settings-description'>
                {t('applicationDetail.settings.profile.descriptionLabel', {
                  defaultValue: 'Description',
                })}
              </Label>
              <Textarea
                id='application-settings-description'
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <Button type='submit'>
              {t('applicationDetail.settings.profile.save', {
                defaultValue: 'Save changes',
              })}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ReleaseDetailsDialog({
  release,
  onClose,
  onPin,
}: {
  readonly release: HubApplicationRelease | undefined;
  readonly onClose: () => void;
  readonly onPin: (releaseId: string) => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <Dialog open={Boolean(release)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {t('applicationDetail.releaseDetails.title', {
              defaultValue: 'Release {{version}}',
              version: release?.version ?? '',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('applicationDetail.releaseDetails.description', {
              defaultValue: 'Published release metadata and notes.',
            })}
          </DialogDescription>
        </DialogHeader>
        {release ? (
          <div className='space-y-4'>
            <dl className='grid grid-cols-2 gap-4 rounded-xl bg-muted/40 p-4'>
              <ApplicationFact
                label={t('applicationDetail.releases.commit', {
                  defaultValue: 'Commit',
                })}
                value={release.commit}
              />
              <ApplicationFact
                label={t('applicationDetail.releases.size', {
                  defaultValue: 'Bundle size',
                })}
                value={release.size}
              />
              <ApplicationFact
                label={t('applicationDetail.releases.publisher', {
                  defaultValue: 'Published by',
                })}
                value={release.createdBy}
              />
              <ApplicationFact
                label={t('applicationDetail.releases.date', {
                  defaultValue: 'Published',
                })}
                value={formatDate(release.createdAt, locale)}
              />
            </dl>
            <div>
              <h3 className='text-sm font-medium'>
                {t('applicationDetail.releaseDetails.notes', {
                  defaultValue: 'Release notes',
                })}
              </h3>
              <p className='mt-1 text-sm text-muted-foreground'>
                {release.notes}
              </p>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          {release ? (
            <Button
              type='button'
              variant='outline'
              aria-label={t('applicationDetail.releases.pinAria', {
                defaultValue: `${release.pinned ? 'Unpin' : 'Pin'} version ${release.version}`,
                action: release.pinned ? 'Unpin' : 'Pin',
                version: release.version,
              })}
              onClick={() => onPin(release.id)}
            >
              <PackageCheck aria-hidden='true' />
              {release.pinned
                ? t('applicationDetail.releases.unpin', {
                    defaultValue: 'Unpin',
                  })
                : t('applicationDetail.releases.pin', {
                    defaultValue: 'Pin',
                  })}
            </Button>
          ) : null}
          <Button type='button' variant='outline' onClick={onClose}>
            {t('common.close', { defaultValue: 'Close' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuthorizationDialog({
  open,
  existingMemberIds,
  onOpenChange,
  onAdd,
}: {
  readonly open: boolean;
  readonly existingMemberIds: readonly string[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onAdd: (access: HubApplicationAccess) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [memberId, setMemberId] = useState('member-2');
  const [role, setRole] = useState<HubApplicationAccess['role']>('operator');
  const members = [
    { id: 'member-2', name: 'Lin Chen' },
    { id: 'member-3', name: 'Alex Kim' },
  ].filter((member) => !existingMemberIds.includes(member.id));
  const selectedMember =
    members.find((member) => member.id === memberId) ?? members[0];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {t('applicationDetail.authorization.title', {
              defaultValue: 'Add authorization',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('applicationDetail.authorization.description', {
              defaultValue: 'Choose a Hub member and an application role.',
            })}
          </DialogDescription>
        </DialogHeader>
        {members.length > 0 ? (
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='authorization-member'>
                {t('applicationDetail.authorization.member', {
                  defaultValue: 'Member',
                })}
              </Label>
              <NativeSelect
                id='authorization-member'
                className='w-full'
                value={selectedMember?.id}
                onChange={(event) => setMemberId(event.target.value)}
              >
                {members.map((member) => (
                  <NativeSelectOption key={member.id} value={member.id}>
                    {member.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='authorization-role'>
                {t('applicationDetail.authorization.role', {
                  defaultValue: 'Role',
                })}
              </Label>
              <NativeSelect
                id='authorization-role'
                className='w-full'
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as HubApplicationAccess['role'])
                }
              >
                <NativeSelectOption value='viewer'>
                  {t('applicationDetail.permissions.roles.viewer', {
                    defaultValue: 'Viewer',
                  })}
                </NativeSelectOption>
                <NativeSelectOption value='operator'>
                  {t('applicationDetail.permissions.roles.operator', {
                    defaultValue: 'Operator',
                  })}
                </NativeSelectOption>
                <NativeSelectOption value='administrator'>
                  {t('applicationDetail.permissions.roles.administrator', {
                    defaultValue: 'Administrator',
                  })}
                </NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('applicationDetail.authorization.empty', {
              defaultValue: 'Every available member already has access.',
            })}
          </p>
        )}
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            type='button'
            disabled={!selectedMember}
            onClick={() => {
              if (!selectedMember) return;
              onAdd({
                id: `access-local-${selectedMember.id}`,
                memberId: selectedMember.id,
                memberName: selectedMember.name,
                role,
              });
            }}
          >
            {t('applicationDetail.authorization.submit', {
              defaultValue: 'Add access',
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDetailAction({
  action,
  applicationName,
  onCancel,
  onConfirm,
}: {
  readonly action: DetailAction | undefined;
  readonly applicationName: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): ReactElement {
  const { t } = useTranslation();
  let title = t('applicationDetail.confirm.runtimeTitle', {
    defaultValue: 'Confirm runtime action',
  });
  let confirm = t('applicationDetail.confirm.continue', {
    defaultValue: 'Continue',
  });
  if (action?.kind === 'runtime') {
    title = t('applicationDetail.confirm.runtimeTitle', {
      defaultValue: 'Confirm runtime action',
    });
    confirm = t(`applicationDetail.confirm.${action.action}`, {
      defaultValue:
        action.action === 'start'
          ? 'Confirm start'
          : action.action === 'stop'
            ? 'Confirm stop'
            : 'Confirm restart',
    });
  } else if (action?.kind === 'release') {
    title = t('applicationDetail.confirm.releaseTitle', {
      defaultValue: 'Confirm {{action}} for {{version}}',
      action:
        action.action === 'deploy'
          ? t('applicationDetail.releases.deploy', { defaultValue: 'deploy' })
          : action.action === 'rollback'
            ? t('applicationDetail.releases.rollback', {
                defaultValue: 'rollback',
              })
            : t('applicationDetail.releases.redeploy', {
                defaultValue: 'redeploy',
              }),
      version: action.version,
    });
    confirm = t(`applicationDetail.confirm.${action.action}`, {
      defaultValue:
        action.action === 'deploy'
          ? 'Confirm deployment'
          : action.action === 'rollback'
            ? 'Confirm rollback'
            : 'Confirm redeployment',
    });
  }
  return (
    <AlertDialog
      open={Boolean(action)}
      onOpenChange={(open) => !open && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('applicationDetail.confirm.description', {
              defaultValue:
                'This changes {{name}} only for the current browser session.',
              name: applicationName,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

function formatDate(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

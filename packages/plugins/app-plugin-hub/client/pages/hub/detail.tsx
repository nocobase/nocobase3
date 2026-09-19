import {
  ArrowLeft,
  CircleStop,
  ExternalLink,
  Play,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '../../components/ui/button.js';
import {
  Dialog as UiDialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Outlet } from 'react-router';
import type { DetailTab, AppDetail } from './types.js';
import { AppMark, StatusBadge } from './shared.js';
import {
  appActionState,
  appManagementStatus,
  applicationUrl,
  hasDeployment,
  formatDate,
} from './utils.js';
import {
  visibleHubDetailTabs,
  type HubCapabilities,
} from '../../permissions.js';

const TAB_LABELS: Readonly<Record<DetailTab, string>> = {
  logs: 'detail.tabs.logs',
  deployments: 'detail.tabs.deployments',
  releases: 'detail.tabs.releases',
  development: 'detail.tabs.development',
  resources: 'detail.tabs.resources',
  configuration: 'detail.tabs.configuration',
  settings: 'detail.tabs.settings',
};

export function Detail({
  app,
  tab,
  busy,
  refreshing = null,
  capabilities,
  onBack,
  onTab,
  onRefresh,
  onStart,
  onRestart,
  onStop,
}: {
  readonly app: AppDetail;
  readonly tab: DetailTab;
  readonly busy: boolean;
  readonly refreshing?: 'auto' | 'manual' | null;
  readonly capabilities: HubCapabilities;
  readonly onBack: () => void;
  readonly onTab: (tab: DetailTab) => void;
  readonly onRefresh: () => void;
  readonly onStart: () => void;
  readonly onRestart: () => void;
  readonly onStop: () => void;
}): ReactElement {
  const { t, i18n } = useTranslation('@nocobase/app-plugin-hub');
  const deployed = hasDeployment(app);
  const detailTabs = visibleHubDetailTabs(
    { hasReleases: app.hasReleases, deployed },
    capabilities,
  );
  const activeTab = detailTabs.includes(tab)
    ? tab
    : (detailTabs[0] ?? 'deployments');
  const visitUrl = applicationUrl(app);
  const status = appManagementStatus(app);
  const running = status === 'running';
  const visitAllowed = status === 'running' || status === 'ready';
  const visitReason = visitAllowed
    ? undefined
    : status === 'host-unavailable'
      ? 'hostUnavailable'
      : status === 'deployment-pending'
        ? 'deploymentInProgress'
        : status === 'not-deployed'
          ? 'deployReleaseFirst'
          : 'notRunning';
  const visitActionReason = busy
    ? 'operationInProgress'
    : (visitReason ?? (!visitUrl ? 'unavailable' : undefined));
  const startState = appActionState(app, 'start', busy);
  const restartState = appActionState(app, 'restart', busy);
  const stopState = appActionState(app, 'stop', busy);
  const lifecycleAction = running ? 'restart' : 'start';
  const lifecycleReason =
    capabilities[lifecycleAction] === true
      ? running
        ? restartState.reason
        : startState.reason
      : undefined;
  const stopReason = capabilities.stop ? stopState.reason : undefined;
  return (
    <>
      <Button
        className='mb-6 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground'
        onClick={onBack}
        variant='ghost'
      >
        <ArrowLeft className='size-4' />{' '}
        {t('detail.allApplications', { defaultValue: 'All applications' })}
      </Button>
      <section className='overflow-hidden rounded-2xl border bg-card shadow-sm'>
        <Tabs
          value={activeTab}
          onValueChange={(value) => onTab(value as DetailTab)}
        >
          <header className='border-b px-5 pt-5 sm:px-8 sm:pt-8'>
            <div className='flex flex-wrap items-start justify-between gap-7 pb-7'>
              <div className='flex min-w-0 items-start gap-4'>
                <AppMark name={app.app.name} />
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                    <h1 className='text-2xl font-semibold'>{app.app.name}</h1>
                    <StatusBadge state={status} />
                  </div>
                  <p className='mt-2 truncate font-mono text-xs text-muted-foreground'>
                    {app.app.id} · {app.deployment.basePath}
                  </p>
                  <div className='mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground'>
                    <span>
                      {t('detail.release', { defaultValue: 'Release' })}{' '}
                      <strong className='font-medium text-foreground'>
                        {app.currentVersion
                          ? `v${app.currentVersion}`
                          : t('detail.notDeployed', {
                              defaultValue: 'Not deployed',
                            })}
                      </strong>
                    </span>
                    <span>
                      {t('detail.startup', { defaultValue: 'Startup' })}{' '}
                      <strong className='font-medium text-foreground'>
                        {app.deployment.activation === 'eager'
                          ? t('detail.withHub', { defaultValue: 'With Hub' })
                          : t('detail.onFirstVisit', {
                              defaultValue: 'On first visit',
                            })}
                      </strong>
                    </span>
                    <span>
                      {t('detail.updated', {
                        date: formatDate(
                          app.deployment.updatedAt,
                          i18n.language,
                        ),
                        defaultValue: `Updated ${formatDate(app.deployment.updatedAt, i18n.language)}`,
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <div className='flex max-w-full flex-wrap justify-end gap-2.5'>
                {capabilities.refresh ? (
                  <Button
                    disabled={busy || refreshing !== null}
                    aria-busy={refreshing !== null}
                    onClick={onRefresh}
                    variant='outline'
                  >
                    <RefreshCw
                      className={`size-4 ${refreshing !== null ? 'animate-spin motion-reduce:animate-none' : ''}`}
                    />{' '}
                    {refreshing === 'manual'
                      ? t('detail.refreshing', { defaultValue: 'Refreshing…' })
                      : t('detail.refreshStatus', {
                          defaultValue: 'Refresh status',
                        })}
                  </Button>
                ) : null}
                {visitUrl && visitAllowed ? (
                  <Button
                    className='cursor-pointer'
                    disabled={busy}
                    title={
                      visitActionReason
                        ? t(`actions.${visitActionReason}`, {
                            defaultValue: visitActionReason,
                          })
                        : undefined
                    }
                    aria-describedby={
                      visitActionReason ? 'hub-visit-action-reason' : undefined
                    }
                    nativeButton={false}
                    render={
                      <a href={visitUrl} rel='noreferrer' target='_blank' />
                    }
                    variant='outline'
                  >
                    <ExternalLink className='size-4' />{' '}
                    {t('detail.visit', { defaultValue: 'Visit' })}
                  </Button>
                ) : (
                  <Button
                    disabled
                    title={
                      visitActionReason
                        ? t(`actions.${visitActionReason}`, {
                            defaultValue: visitActionReason,
                          })
                        : undefined
                    }
                    aria-describedby={
                      visitActionReason ? 'hub-visit-action-reason' : undefined
                    }
                    variant='outline'
                  >
                    <ExternalLink className='size-4' />{' '}
                    {t('detail.visit', { defaultValue: 'Visit' })}
                  </Button>
                )}
                {capabilities[running ? 'restart' : 'start'] ? (
                  <Button
                    disabled={
                      !deployed ||
                      !(running ? restartState.enabled : startState.enabled)
                    }
                    onClick={running ? onRestart : onStart}
                    variant='outline'
                    title={
                      lifecycleReason
                        ? t(`actions.${lifecycleReason}`, {
                            defaultValue: lifecycleReason,
                          })
                        : undefined
                    }
                    aria-describedby={
                      lifecycleReason
                        ? 'hub-lifecycle-action-reason'
                        : undefined
                    }
                  >
                    {running ? (
                      <RefreshCw className='size-4' />
                    ) : (
                      <Play className='size-4' />
                    )}{' '}
                    {running
                      ? t('detail.restart', { defaultValue: 'Restart' })
                      : t('detail.start', { defaultValue: 'Start' })}
                  </Button>
                ) : null}
                {capabilities.stop ? (
                  <Button
                    disabled={!stopState.enabled}
                    onClick={onStop}
                    variant='outline'
                    title={
                      stopState.reason
                        ? t(`actions.${stopState.reason}`, {
                            defaultValue: stopState.reason,
                          })
                        : undefined
                    }
                    aria-describedby={
                      stopState.reason ? 'hub-stop-action-reason' : undefined
                    }
                  >
                    <CircleStop className='size-4' />{' '}
                    {t('detail.stop', { defaultValue: 'Stop' })}
                  </Button>
                ) : null}
              </div>
            </div>
            {lifecycleReason || stopReason || visitActionReason ? (
              <>
                <span className='sr-only' id='hub-lifecycle-action-reason'>
                  {lifecycleReason
                    ? t(`actions.${lifecycleReason}`, {
                        defaultValue: lifecycleReason,
                      })
                    : null}
                </span>
                <span className='sr-only' id='hub-stop-action-reason'>
                  {stopReason
                    ? t(`actions.${stopReason}`, {
                        defaultValue: stopReason,
                      })
                    : null}
                </span>
                {visitActionReason ? (
                  <span className='sr-only' id='hub-visit-action-reason'>
                    {t(`actions.${visitActionReason}`, {
                      defaultValue: visitActionReason,
                    })}
                  </span>
                ) : null}
              </>
            ) : null}
            <TabsList className='-mb-px gap-5 px-1'>
              {detailTabs.map((item) => (
                <TabsTrigger key={item} value={item}>
                  {t(TAB_LABELS[item], { defaultValue: item })}
                </TabsTrigger>
              ))}
            </TabsList>
          </header>
          <div className='p-5 sm:px-8 sm:py-7'>
            <Outlet />
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
  readonly app: Pick<AppDetail, 'app'>;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onRemove: () => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-hub');
  return (
    <UiDialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className='max-w-[30rem] overflow-hidden p-0'>
        <DialogHeader className='mb-0 px-6 pt-6 pr-14'>
          <div className='flex items-start gap-3.5'>
            <span className='grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive'>
              <Trash2 className='size-5' />
            </span>
            <div className='min-w-0 pt-0.5'>
              <DialogTitle>
                {t('detail.removeTitle', {
                  defaultValue: 'Remove application?',
                })}
              </DialogTitle>
              <DialogDescription className='mt-1.5 leading-6'>
                {t('detail.removeDescription', {
                  name: app.app.name,
                  defaultValue: `${app.app.name} and all of its releases, configuration, and application data will be permanently deleted.`,
                })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className='px-6 py-5'>
          <div className='flex items-center gap-2.5 rounded-lg bg-destructive/5 px-3.5 py-3 text-sm text-destructive'>
            <TriangleAlert className='size-4 shrink-0' />
            <span>
              {t('detail.removeWarning', {
                defaultValue: 'This action cannot be undone.',
              })}
            </span>
          </div>
        </div>
        <div className='flex justify-end gap-2 border-t bg-muted/30 px-6 py-4'>
          <Button
            className='cursor-pointer'
            disabled={busy}
            onClick={onClose}
            variant='outline'
          >
            {t('detail.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            className='min-w-20 cursor-pointer bg-destructive text-white hover:bg-destructive/90'
            disabled={busy}
            onClick={onRemove}
            variant='destructive'
          >
            {busy
              ? t('detail.removing', { defaultValue: 'Removing…' })
              : t('detail.remove', { defaultValue: 'Remove' })}
          </Button>
        </div>
      </DialogContent>
    </UiDialog>
  );
}

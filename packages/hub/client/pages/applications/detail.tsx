import {
  Activity,
  ArrowLeft,
  Boxes,
  Download,
  ExternalLink,
  KeyRound,
  PackageCheck,
  Rocket,
  Settings2,
  SquareTerminal,
} from 'lucide-react';
import { useTranslate } from '@refinedev/core';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import {
  type HubApplication,
  type HubApplicationAccess,
  type HubAuditLog,
  type HubDeployment,
  type HubDeploymentType,
  type HubFetcher,
  type HubMe,
  type HubMember,
  type HubRelease,
  type HubRole,
  type HubRuntime,
  type HubRuntimeSecretSummary,
  type HubSettings,
  buildHubApiUrl,
  hasHubCapability,
  hubPost,
  hubPatch,
  hubRequest,
  useHubQuery,
} from '@/features/hub/api';
import {
  formatHubBytes,
  formatHubDate,
  formatHubDuration,
  getHubErrorMessage,
  HubEmptyState,
  HubErrorState,
  HubLoadMore,
  HubLoadingState,
  HubNotFoundState,
  HubStatusBadge,
} from '@/features/hub/components';
import { HubTablePagination } from '@/features/hub/management-components';
import {
  useHubPageQuery,
  useHubPaginatedQuery,
} from '@/features/hub/pagination';
import { useOptionalHubRuntime } from '@/features/hub/provider';
import { getHubBrowserBase } from '@/features/hub/runtime';
import { getDeploymentTypeLabel, getStatusLabel } from '@/features/hub/status';
import {
  getHubAuditActionLabel,
  getHubAuditResourceLabel,
  getHubAuditSourceLabel,
  getHubCapabilityActionLabel,
  getHubCapabilityResourceLabel,
  getHubEnvironmentLabel,
  getHubRoleLabel,
  getHubRoleScopeLabel,
} from '@/features/hub/labels';

export interface ApplicationDetailPageProps {
  applicationId?: string;
  fetcher?: HubFetcher;
  onDeployRelease?: (release: HubRelease, application: HubApplication) => void;
}

export function ApplicationDetailPage({
  applicationId: applicationIdProp,
  fetcher,
  onDeployRelease,
}: ApplicationDetailPageProps) {
  const translate = useTranslate();
  const params = useParams<{ appId?: string; applicationId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const applicationId =
    applicationIdProp ?? params.appId ?? params.applicationId;
  const encodedId = applicationId ? encodeURIComponent(applicationId) : null;
  const application = useHubQuery<HubApplication>({
    path: encodedId ? `/apps/${encodedId}` : null,
    fetcher,
  });
  const runtime = useOptionalHubRuntime();
  const me = useHubQuery<HubMe>({
    path: encodedId && !runtime ? '/me' : null,
    fetcher,
    enabled: Boolean(encodedId && !runtime),
  });
  const capabilities = runtime?.me.capabilities ?? me.data?.capabilities;
  const canReadReleases = hasHubCapability(
    capabilities,
    'hub.release',
    'read',
    applicationId,
  );
  const canReadDeployments = hasHubCapability(
    capabilities,
    'hub.deployment',
    'read',
    applicationId,
  );
  const canUpdateReleases = hasHubCapability(
    capabilities,
    'hub.release',
    'update',
    applicationId,
  );
  const canDevelop = hasHubCapability(
    capabilities,
    'hub.release',
    'create',
    applicationId,
  );
  const canReadRuntime = hasHubCapability(
    capabilities,
    'hub.runtime',
    'read',
    applicationId,
  );
  const canControlRuntime = hasHubCapability(
    capabilities,
    'hub.runtime',
    'control',
    applicationId,
  );
  const canReadRuntimeSecret = hasHubCapability(
    capabilities,
    'hub.runtimeSecret',
    'read',
    applicationId,
  );
  const canRotateRuntimeSecret = hasHubCapability(
    capabilities,
    'hub.runtimeSecret',
    'rotate',
    applicationId,
  );
  const canReadPermissions = hasHubCapability(
    capabilities,
    'hub.permission',
    'read',
    applicationId,
  );
  const canReadActivity = hasHubCapability(
    capabilities,
    'hub.auditLog',
    'read',
    applicationId,
  );
  const canExportActivity = hasHubCapability(
    capabilities,
    'hub.auditLog',
    'export',
    applicationId,
  );
  const canUpdateApplication = hasHubCapability(
    capabilities,
    'hub.app',
    'update',
    applicationId,
  );
  const canAssignPermissions = hasHubCapability(
    capabilities,
    'hub.permission',
    'assign',
    applicationId,
  );
  const canReadMembers = hasHubCapability(capabilities, 'hub.member', 'read');
  const canArchiveApplication = hasHubCapability(
    capabilities,
    'hub.app',
    'archive',
    applicationId,
  );
  const canRestoreApplication = hasHubCapability(
    capabilities,
    'hub.app',
    'restore',
    applicationId,
  );
  const releases = useHubPaginatedQuery<HubRelease>({
    path: encodedId ? `/apps/${encodedId}/releases` : null,
    fetcher,
    enabled: canReadReleases,
  });
  const deployments = useHubPaginatedQuery<HubDeployment>({
    path: encodedId ? `/apps/${encodedId}/deployments` : null,
    fetcher,
    enabled: canReadDeployments,
  });
  const runtimeSnapshot = useHubQuery<HubRuntime>({
    path: encodedId && canReadRuntime ? `/apps/${encodedId}/runtime` : null,
    fetcher,
    enabled: canReadRuntime,
  });
  const runtimeSecret = useHubQuery<HubRuntimeSecretSummary>({
    path:
      encodedId && canReadRuntimeSecret
        ? `/apps/${encodedId}/runtime-secret`
        : null,
    fetcher,
    enabled: canReadRuntimeSecret,
  });
  const access = useHubPaginatedQuery<HubApplicationAccess>({
    path: encodedId && canReadPermissions ? `/apps/${encodedId}/access` : null,
    fetcher,
    enabled: canReadPermissions,
  });
  const roles = useHubQuery<HubRole[]>({
    path: canReadPermissions ? '/roles' : null,
    fetcher,
    enabled: canReadPermissions,
    initialData: [],
  });
  const activity = useHubPageQuery<HubAuditLog>({
    path:
      encodedId && canReadActivity
        ? `/audit-logs?applicationId=${encodedId}`
        : null,
    fetcher,
    enabled: canReadActivity,
  });
  const canDeploy = hasHubCapability(
    capabilities,
    'hub.deployment',
    'deploy',
    applicationId,
  );
  const canRollback = hasHubCapability(
    capabilities,
    'hub.deployment',
    'rollback',
    applicationId,
  );
  const canRedeploy = hasHubCapability(
    capabilities,
    'hub.deployment',
    'redeploy',
    applicationId,
  );
  const canReadGlobalApplications = hasHubCapability(
    capabilities,
    'hub.app',
    'read',
  );
  const canReadSettings = hasHubCapability(capabilities, 'hub.setting', 'read');
  const confirmationSettings = useHubQuery<HubSettings>({
    path: canReadSettings ? '/settings' : null,
    fetcher,
    enabled: canReadSettings,
  });
  const [selectedRelease, setSelectedRelease] = useState<HubRelease | null>(
    null,
  );
  const [selectedDeploymentType, setSelectedDeploymentType] =
    useState<HubDeploymentType>('deploy');
  const [submittingDeployment, setSubmittingDeployment] = useState(false);
  const [deploymentError, setDeploymentError] = useState<Error | null>(null);
  const requestedTab = searchParams.get('tab');
  const activeTab = [
    'overview',
    'development',
    'releases',
    'deployments',
    'activity',
    'permissions',
    'settings',
  ].includes(requestedTab ?? '')
    ? requestedTab!
    : 'overview';

  const submitDeployment = (release: HubRelease, type: HubDeploymentType) => {
    if (!encodedId) return;
    setSubmittingDeployment(true);
    setDeploymentError(null);
    void hubRequest<HubDeployment>(
      `/apps/${encodedId}/deployments`,
      {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          targetReleaseId: release.id,
          type,
        }),
      },
      fetcher,
    )
      .then((result) => {
        setSelectedRelease(null);
        setSelectedDeploymentType('deploy');
        void navigate(`/deployments/${result.data.id}`);
      })
      .catch((reason: unknown) => {
        setDeploymentError(
          reason instanceof Error ? reason : new Error(String(reason)),
        );
      })
      .finally(() => setSubmittingDeployment(false));
  };

  const requestDeployment = (
    release: HubRelease,
    app: HubApplication,
    type?: HubDeploymentType,
  ) => {
    if (onDeployRelease && type !== 'redeploy') {
      onDeployRelease(release, app);
      return;
    }
    const activeRelease = app.activeRelease;
    const resolvedType =
      type === 'redeploy'
        ? 'redeploy'
        : activeRelease &&
            new Date(release.createdAt).valueOf() <
              new Date(activeRelease.createdAt).valueOf()
          ? 'rollback'
          : 'deploy';
    setDeploymentError(null);
    if (
      resolvedType === 'rollback' &&
      confirmationSettings.data?.confirmation.rollback === false
    ) {
      submitDeployment(release, resolvedType);
      return;
    }
    setSelectedDeploymentType(resolvedType);
    setSelectedRelease(release);
  };

  const applicationKind = translate(
    'hub.application.notFoundKind',
    'Application',
  );
  if (!applicationId) return <HubNotFoundState kind={applicationKind} />;
  if (!runtime && me.loading) {
    return (
      <HubLoadingState
        label={translate('hub.access.loading', 'Loading Hub access')}
      />
    );
  }
  if (!runtime && me.error) {
    return (
      <HubErrorState
        error={me.error}
        onRetry={me.reload}
        title={translate(
          'hub.access.loadError',
          'Unable to load your Hub access',
        )}
      />
    );
  }
  if (application.loading)
    return (
      <HubLoadingState
        label={translate('hub.application.loading', 'Loading application')}
      />
    );
  if (application.error) {
    return (
      <HubErrorState
        error={application.error}
        onRetry={application.reload}
        title={translate(
          'hub.application.loadError',
          'Unable to load application',
        )}
      />
    );
  }
  if (!application.data) return <HubNotFoundState kind={applicationKind} />;
  const applicationData = application.data;

  return (
    <div className='space-y-6'>
      <header className='space-y-4'>
        <Button
          variant='ghost'
          size='sm'
          nativeButton={false}
          render={<Link to={canReadGlobalApplications ? '/apps' : '/'} />}
        >
          <ArrowLeft aria-hidden='true' />
          {canReadGlobalApplications
            ? translate('hub.common.applications', 'Applications')
            : translate('hub.common.home', 'Home')}
        </Button>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='space-y-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <h1 className='font-heading text-2xl font-semibold tracking-tight'>
                {applicationData.name}
              </h1>
              <HubStatusBadge status={applicationData.status} />
            </div>
            <p className='font-mono text-xs text-muted-foreground'>
              {applicationData.slug}
            </p>
            {applicationData.description ? (
              <p className='max-w-2xl text-sm text-muted-foreground'>
                {applicationData.description}
              </p>
            ) : null}
          </div>
          <div className='flex flex-wrap gap-2'>
            {applicationData.links?.open ? (
              <Button
                variant='outline'
                nativeButton={false}
                render={
                  <a
                    href={applicationData.links.open}
                    target='_blank'
                    rel='noreferrer'
                  />
                }
              >
                <ExternalLink aria-hidden='true' />
                {translate('hub.application.open', 'Open application')}
              </Button>
            ) : null}
            {canDevelop ? (
              <Button
                variant='outline'
                onClick={() => setSearchParams({ tab: 'development' })}
              >
                <SquareTerminal aria-hidden='true' />
                {translate('hub.application.develop', 'Develop')}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value: string) => {
          if (value === 'overview') setSearchParams({});
          else setSearchParams({ tab: value });
        }}
      >
        <TabsList
          variant='line'
          className='max-w-full justify-start overflow-x-auto'
          aria-label={translate(
            'hub.application.sectionsAria',
            'Application sections',
          )}
        >
          <TabsTrigger value='overview'>
            {translate('hub.application.tabs.overview', 'Overview')}
          </TabsTrigger>
          {canDevelop ? (
            <TabsTrigger value='development'>
              {translate('hub.application.tabs.development', 'Development')}
            </TabsTrigger>
          ) : null}
          {canReadReleases ? (
            <TabsTrigger value='releases'>
              {translate('hub.application.tabs.releases', 'Releases')}
            </TabsTrigger>
          ) : null}
          {canReadDeployments ? (
            <TabsTrigger value='deployments'>
              {translate('hub.application.tabs.deployments', 'Deployments')}
            </TabsTrigger>
          ) : null}
          {canReadActivity ? (
            <TabsTrigger value='activity'>
              {translate('hub.application.tabs.activity', 'Activity')}
            </TabsTrigger>
          ) : null}
          {canReadPermissions ? (
            <TabsTrigger value='permissions'>
              {translate('hub.application.tabs.permissions', 'Permissions')}
            </TabsTrigger>
          ) : null}
          {canUpdateApplication ||
          canRestoreApplication ||
          canReadRuntime ||
          canReadRuntimeSecret ? (
            <TabsTrigger value='settings'>
              {translate('hub.application.tabs.settings', 'Settings')}
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value='overview' className='pt-4'>
          <ApplicationOverview
            application={applicationData}
            releases={releases.data ?? []}
            deployments={deployments.data ?? []}
            releaseTotal={releases.meta?.total}
            canReadReleases={canReadReleases}
            canReadDeployments={canReadDeployments}
          />
        </TabsContent>
        {canDevelop ? (
          <TabsContent value='development' className='pt-4'>
            <ApplicationDevelopment application={applicationData} />
          </TabsContent>
        ) : null}
        {canReadReleases ? (
          <TabsContent value='releases' className='pt-4'>
            <ApplicationReleases
              application={applicationData}
              releases={releases.data ?? []}
              loading={releases.loading}
              error={releases.error}
              onRetry={releases.reload}
              hasMore={releases.hasMore}
              loadingMore={releases.loadingMore}
              onLoadMore={releases.loadMore}
              canDeploy={canDeploy}
              canRollback={canRollback}
              canRedeploy={canRedeploy}
              canUpdate={canUpdateReleases}
              onDeployRelease={requestDeployment}
              onRedeployRelease={(release, app) =>
                requestDeployment(release, app, 'redeploy')
              }
              fetcher={fetcher}
              onChanged={releases.reload}
            />
          </TabsContent>
        ) : null}
        {canReadDeployments ? (
          <TabsContent value='deployments' className='pt-4'>
            <ApplicationDeployments
              deployments={deployments.data ?? []}
              releases={releases.data ?? []}
              actorNames={
                new Map(
                  (access.data ?? []).flatMap((item) => {
                    const id = item.memberId ?? item.id;
                    return id ? [[id, item.name] as const] : [];
                  }),
                )
              }
              loading={deployments.loading}
              error={deployments.error}
              onRetry={deployments.reload}
              hasMore={deployments.hasMore}
              loadingMore={deployments.loadingMore}
              onLoadMore={deployments.loadMore}
            />
          </TabsContent>
        ) : null}
        {canReadActivity ? (
          <TabsContent value='activity' className='pt-4'>
            <ApplicationActivity
              applicationId={applicationData.id}
              logs={activity.data}
              loading={activity.loading}
              error={activity.error}
              onRetry={activity.reload}
              page={activity.page}
              pageCount={activity.pageCount}
              pageSize={activity.pageSize}
              total={activity.total}
              onPageChange={activity.setPage}
              onPageSizeChange={activity.setPageSize}
              canExport={canExportActivity}
            />
          </TabsContent>
        ) : null}
        {canReadPermissions ? (
          <TabsContent value='permissions' className='pt-4'>
            <ApplicationPermissions
              applicationId={applicationData.id}
              access={access.data ?? []}
              roles={roles.data ?? []}
              loading={access.loading || roles.loading}
              error={access.error ?? roles.error}
              onRetry={() => {
                access.reload();
                roles.reload();
              }}
              hasMore={access.hasMore}
              loadingMore={access.loadingMore}
              onLoadMore={access.loadMore}
              canAssign={canAssignPermissions}
              canAdd={canAssignPermissions && canReadMembers}
              fetcher={fetcher}
              onChanged={access.reload}
            />
          </TabsContent>
        ) : null}
        {canUpdateApplication ||
        canRestoreApplication ||
        canReadRuntime ||
        canReadRuntimeSecret ? (
          <TabsContent value='settings' className='pt-4'>
            <ApplicationSettings
              application={applicationData}
              runtime={runtimeSnapshot.data}
              runtimeLoading={runtimeSnapshot.loading}
              runtimeSecret={runtimeSecret.data}
              canUpdate={canUpdateApplication}
              canArchive={canArchiveApplication}
              canRestore={canRestoreApplication}
              canControlRuntime={canControlRuntime}
              canRotateRuntimeSecret={canRotateRuntimeSecret}
              confirmation={confirmationSettings.data?.confirmation}
              fetcher={fetcher}
              onChanged={() => {
                application.reload();
                runtimeSnapshot.reload();
                runtimeSecret.reload();
              }}
            />
          </TabsContent>
        ) : null}
      </Tabs>
      <AlertDialog
        open={Boolean(selectedRelease)}
        onOpenChange={(open) => {
          if (!open && !submittingDeployment) {
            setSelectedRelease(null);
            setSelectedDeploymentType('deploy');
            setDeploymentError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedDeploymentType === 'redeploy'
                ? translate(
                    'hub.application.redeploy.title',
                    'Redeploy current release',
                  )
                : applicationData.activeRelease
                  ? translate(
                      'hub.application.deploy.changeTitle',
                      'Change active release',
                    )
                  : translate('hub.application.deploy.title', 'Deploy release')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className='block'>
                {translateWithValues(
                  translate,
                  'hub.application.deploy.currentRelease',
                  'Current release: {{version}}',
                  {
                    version:
                      applicationData.activeRelease?.version ??
                      translate('hub.common.none', 'None'),
                  },
                )}
              </span>
              <span className='block'>
                {translateWithValues(
                  translate,
                  'hub.application.deploy.targetRelease',
                  'Target release: {{version}}',
                  { version: selectedRelease?.version ?? '—' },
                )}
              </span>
              <span className='block'>
                {translateWithValues(
                  translate,
                  'hub.application.deploy.environment',
                  'Environment: {{environment}}',
                  {
                    environment: getHubEnvironmentLabel(
                      applicationData.defaultEnvironmentId,
                      translate,
                    ),
                  },
                )}
              </span>
              <span className='mt-2 block'>
                {translate(
                  'hub.application.deploy.description',
                  'This creates a new Deployment. If it fails, the current release remains active.',
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deploymentError ? (
            <Alert variant='destructive'>
              <AlertTitle>
                {translate(
                  'hub.application.deploy.error',
                  'Unable to create deployment',
                )}
              </AlertTitle>
              <AlertDescription>
                {getHubErrorMessage(deploymentError, translate)}
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingDeployment}>
              {translate('hub.common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submittingDeployment || !selectedRelease}
              onClick={(event) => {
                event.preventDefault();
                if (!selectedRelease) return;
                submitDeployment(selectedRelease, selectedDeploymentType);
              }}
            >
              {submittingDeployment ? <Spinner aria-hidden='true' /> : null}
              {submittingDeployment
                ? translate('hub.application.deploy.starting', 'Starting…')
                : selectedDeploymentType === 'redeploy'
                  ? translate(
                      'hub.application.redeploy.confirm',
                      'Confirm redeployment',
                    )
                  : translate(
                      'hub.application.deploy.confirm',
                      'Confirm deployment',
                    )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ApplicationOverview({
  application,
  releases,
  deployments,
  releaseTotal,
  canReadReleases,
  canReadDeployments,
}: {
  application: HubApplication;
  releases: HubRelease[];
  deployments: HubDeployment[];
  releaseTotal?: number;
  canReadReleases: boolean;
  canReadDeployments: boolean;
}) {
  const translate = useTranslate();
  const activeRelease = application.activeRelease;
  const latestDeployment = useMemo(
    () =>
      [...deployments].sort(
        (left, right) =>
          new Date(right.createdAt).valueOf() -
          new Date(left.createdAt).valueOf(),
      )[0],
    [deployments],
  );

  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
      <OverviewCard
        icon={<Rocket aria-hidden='true' />}
        label={translate(
          'hub.application.overview.currentRelease',
          'Current release',
        )}
        value={
          activeRelease?.version ??
          translate('hub.application.overview.notDeployed', 'Not deployed')
        }
        detail={
          activeRelease
            ? translateWithValues(
                translate,
                'hub.application.overview.verifiedAt',
                'Verified {{date}}',
                { date: formatHubDate(activeRelease.createdAt) },
              )
            : translate(
                'hub.application.overview.noActiveMetadata',
                'No active release metadata',
              )
        }
      />
      <OverviewCard
        icon={<Boxes aria-hidden='true' />}
        label={translate('hub.application.overview.environment', 'Environment')}
        value={getHubEnvironmentLabel(
          application.defaultEnvironmentId,
          translate,
        )}
        detail={translate(
          'hub.application.overview.mvpTarget',
          'MVP deployment target',
        )}
      />
      <OverviewCard
        icon={<Activity aria-hidden='true' />}
        label={translate(
          'hub.application.overview.latestDeployment',
          'Latest deployment',
        )}
        value={
          canReadDeployments
            ? latestDeployment
              ? latestDeployment.status
              : translate(
                  'hub.application.overview.noDeployments',
                  'No deployments',
                )
            : translate('hub.common.restricted', 'Restricted')
        }
        detail={
          !canReadDeployments
            ? translate(
                'hub.application.overview.deploymentRestricted',
                'Deployment access not granted',
              )
            : latestDeployment
              ? formatHubDate(latestDeployment.createdAt)
              : translate(
                  'hub.application.overview.publishToBegin',
                  'Publish a verified release to begin',
                )
        }
        status={canReadDeployments ? latestDeployment?.status : undefined}
      />
      <OverviewCard
        icon={<PackageCheck aria-hidden='true' />}
        label={translate(
          'hub.application.overview.availableReleases',
          'Available releases',
        )}
        value={
          canReadReleases
            ? String(releaseTotal ?? releases.length)
            : translate('hub.common.restricted', 'Restricted')
        }
        detail={
          canReadReleases
            ? translateWithValues(
                translate,
                'hub.application.overview.updatedAt',
                'Updated {{date}}',
                { date: formatHubDate(application.updatedAt) },
              )
            : translate(
                'hub.application.overview.releaseRestricted',
                'Release access not granted',
              )
        }
      />
    </div>
  );
}

function OverviewCard({
  icon,
  label,
  value,
  detail,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  status?: string;
}) {
  return (
    <Card size='sm'>
      <CardHeader>
        <div className='flex items-center gap-2 text-muted-foreground [&_svg]:size-4'>
          {icon}
          <CardDescription>{label}</CardDescription>
        </div>
        <CardTitle className='flex items-center gap-2 pt-1'>
          {status ? <HubStatusBadge status={status} /> : value}
        </CardTitle>
      </CardHeader>
      <CardContent className='text-xs text-muted-foreground'>
        {detail}
      </CardContent>
    </Card>
  );
}

function ApplicationReleases({
  application,
  releases,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onLoadMore,
  canDeploy,
  canRollback,
  canRedeploy,
  canUpdate,
  onDeployRelease,
  onRedeployRelease,
  fetcher,
  onChanged,
}: {
  application: HubApplication;
  releases: HubRelease[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  canDeploy: boolean;
  canRollback: boolean;
  canRedeploy: boolean;
  canUpdate: boolean;
  onDeployRelease?: (release: HubRelease, application: HubApplication) => void;
  onRedeployRelease?: (
    release: HubRelease,
    application: HubApplication,
  ) => void;
  fetcher?: HubFetcher;
  onChanged: () => void;
}) {
  const translate = useTranslate();
  const [selectedRelease, setSelectedRelease] = useState<HubRelease | null>(
    null,
  );
  const [updatingRetention, setUpdatingRetention] = useState(false);
  const [retentionError, setRetentionError] = useState<Error | null>(null);
  const releaseDetail = useHubQuery<HubRelease>({
    path: selectedRelease
      ? `/apps/${encodeURIComponent(application.id)}/releases/${encodeURIComponent(selectedRelease.id)}`
      : null,
    fetcher,
    enabled: Boolean(selectedRelease),
  });
  if (loading) {
    return (
      <HubLoadingState
        label={translate('hub.releases.loading', 'Loading releases')}
      />
    );
  }
  if (error) return <HubErrorState error={error} onRetry={onRetry} />;
  if (releases.length === 0) {
    return (
      <HubEmptyState
        title={translate('hub.releases.empty.title', 'No releases')}
        description={translate(
          'hub.releases.empty.description',
          'Ask your Coding Agent to publish the verified application build to Hub.',
        )}
      />
    );
  }

  return (
    <div className='space-y-4'>
      <Card className='py-0'>
        <CardContent className='px-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='pl-4'>
                  {translate('hub.releases.columns.version', 'Version')}
                </TableHead>
                <TableHead>
                  {translate(
                    'hub.releases.columns.verification',
                    'Verification',
                  )}
                </TableHead>
                <TableHead>
                  {translate('hub.releases.columns.size', 'Size')}
                </TableHead>
                <TableHead>
                  {translate('hub.releases.columns.created', 'Created')}
                </TableHead>
                <TableHead className='text-right'>
                  {translate('hub.releases.columns.action', 'Action')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {releases.map((release) => {
                const isCurrent = release.id === application.activeRelease?.id;
                const isRollback =
                  Boolean(application.activeRelease) &&
                  new Date(release.createdAt).valueOf() <
                    new Date(
                      application.activeRelease?.createdAt ?? release.createdAt,
                    ).valueOf();
                return (
                  <TableRow key={release.id}>
                    <TableCell className='pl-4 font-medium'>
                      <div className='flex items-center gap-2'>
                        <Button
                          type='button'
                          variant='link'
                          className='h-auto p-0 font-medium'
                          aria-label={translateWithValues(
                            translate,
                            'hub.releases.viewAria',
                            'View release {{version}}',
                            { version: release.version },
                          )}
                          onClick={() => {
                            setRetentionError(null);
                            setSelectedRelease(release);
                          }}
                        >
                          {release.version}
                        </Button>
                        {isCurrent ? (
                          <Badge variant='outline'>
                            {translate('hub.releases.current', 'Current')}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <HubStatusBadge status={release.verificationStatus} />
                    </TableCell>
                    <TableCell>{formatHubBytes(release.sizeBytes)}</TableCell>
                    <TableCell>{formatHubDate(release.createdAt)}</TableCell>
                    <TableCell className='text-right'>
                      {isCurrent &&
                      canRedeploy &&
                      onRedeployRelease &&
                      release.verificationStatus === 'verified' ? (
                        <Button
                          type='button'
                          size='sm'
                          variant='outline'
                          aria-label={translateWithValues(
                            translate,
                            'hub.releases.redeployAria',
                            'Redeploy {{version}}',
                            { version: release.version },
                          )}
                          onClick={() =>
                            onRedeployRelease(release, application)
                          }
                        >
                          {translate('hub.releases.redeploy', 'Redeploy')}
                        </Button>
                      ) : (isRollback ? canRollback : canDeploy) &&
                        onDeployRelease &&
                        release.verificationStatus === 'verified' &&
                        !isCurrent ? (
                        <Button
                          type='button'
                          size='sm'
                          variant='outline'
                          aria-label={translateWithValues(
                            translate,
                            'hub.releases.deployAria',
                            'Deploy {{version}}',
                            { version: release.version },
                          )}
                          onClick={() => onDeployRelease(release, application)}
                        >
                          {application.activeRelease
                            ? translate(
                                'hub.releases.deployOrRollback',
                                'Deploy / roll back',
                              )
                            : translate('hub.releases.deploy', 'Deploy')}
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
      <HubLoadMore
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
      <Dialog
        open={Boolean(selectedRelease)}
        onOpenChange={(open) => {
          if (!open && !updatingRetention) {
            setSelectedRelease(null);
            setRetentionError(null);
          }
        }}
      >
        <DialogContent className='sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>
              {translateWithValues(
                translate,
                'hub.releases.detail.title',
                'Release {{version}}',
                {
                  version:
                    releaseDetail.data?.version ??
                    selectedRelease?.version ??
                    '—',
                },
              )}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'hub.releases.detail.description',
                'Immutable build metadata, checksum, and retention state.',
              )}
            </DialogDescription>
          </DialogHeader>
          {releaseDetail.error ? (
            <HubErrorState
              error={releaseDetail.error}
              onRetry={releaseDetail.reload}
            />
          ) : releaseDetail.loading && !releaseDetail.data ? (
            <HubLoadingState
              label={translate(
                'hub.releases.detail.loading',
                'Loading release details',
              )}
            />
          ) : selectedRelease ? (
            <ReleaseDetails
              release={releaseDetail.data ?? selectedRelease}
              translate={translate}
            />
          ) : null}
          {retentionError ? (
            <Alert variant='destructive'>
              <AlertTitle>
                {translate(
                  'hub.releases.retentionError',
                  'Unable to update release retention',
                )}
              </AlertTitle>
              <AlertDescription>
                {getHubErrorMessage(retentionError, translate)}
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={updatingRetention}
              onClick={() => setSelectedRelease(null)}
            >
              {translate('hub.common.close', 'Close')}
            </Button>
            {canUpdate && selectedRelease ? (
              <Button
                type='button'
                disabled={updatingRetention || releaseDetail.loading}
                onClick={() => {
                  const current = releaseDetail.data ?? selectedRelease;
                  const action = current.retention?.pinned ? 'unpin' : 'pin';
                  setUpdatingRetention(true);
                  setRetentionError(null);
                  void hubPost<HubRelease>(
                    `/apps/${encodeURIComponent(application.id)}/releases/${encodeURIComponent(current.id)}/${action}`,
                    {},
                    fetcher,
                  )
                    .then((result) => {
                      setSelectedRelease(result.data);
                      releaseDetail.reload();
                      onChanged();
                    })
                    .catch((reason: unknown) => {
                      setRetentionError(
                        reason instanceof Error
                          ? reason
                          : new Error(String(reason)),
                      );
                    })
                    .finally(() => setUpdatingRetention(false));
                }}
              >
                {updatingRetention
                  ? translate('hub.common.saving', 'Saving…')
                  : (releaseDetail.data ?? selectedRelease).retention?.pinned
                    ? translate('hub.releases.unpin', 'Unpin release')
                    : translate('hub.releases.pin', 'Pin release')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReleaseDetails({
  release,
  translate,
}: {
  release: HubRelease;
  translate: ReturnType<typeof useTranslate>;
}) {
  return (
    <div className='space-y-4'>
      <dl className='grid gap-4 text-sm sm:grid-cols-2'>
        <Detail
          label={translate('hub.common.status', 'Status')}
          value={getStatusLabel(release.verificationStatus, translate)}
        />
        <Detail
          label={translate('hub.releases.detail.checksum', 'Checksum')}
          value={release.checksum}
          mono
        />
        <Detail
          label={translate('hub.releases.columns.size', 'Size')}
          value={formatHubBytes(release.sizeBytes)}
        />
        <Detail
          label={translate('hub.releases.detail.createdBy', 'Created by')}
          value={release.createdBy}
        />
        <Detail
          label={translate('hub.releases.columns.created', 'Created')}
          value={formatHubDate(release.createdAt)}
        />
        <Detail
          label={translate('hub.releases.detail.retention', 'Retention')}
          value={
            release.retention?.pinned
              ? translate('hub.releases.detail.pinned', 'Pinned')
              : translate('hub.releases.detail.policyManaged', 'Policy managed')
          }
        />
        {release.retention?.pinnedAt ? (
          <Detail
            label={translate('hub.releases.detail.pinnedAt', 'Pinned at')}
            value={formatHubDate(release.retention.pinnedAt)}
          />
        ) : null}
      </dl>
      <div className='space-y-2'>
        <Label>{translate('hub.releases.detail.manifest', 'Manifest')}</Label>
        <pre className='max-h-56 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs'>
          {JSON.stringify(release.manifest, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function ApplicationActivity({
  applicationId,
  logs,
  loading,
  error,
  onRetry,
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  canExport,
}: {
  applicationId: string;
  logs: HubAuditLog[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  canExport: boolean;
}) {
  const translate = useTranslate();
  const exportUrl = buildHubApiUrl(
    `/audit-logs.csv?applicationId=${encodeURIComponent(applicationId)}`,
  );

  if (error) return <HubErrorState error={error} onRetry={onRetry} />;
  if (loading) {
    return (
      <HubLoadingState
        label={translate('hub.applicationActivity.loading', 'Loading activity')}
      />
    );
  }

  return (
    <Card className='py-0'>
      <CardHeader className='border-b py-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='space-y-1'>
            <CardTitle>
              {translate(
                'hub.applicationActivity.title',
                'Application activity',
              )}
            </CardTitle>
            <CardDescription>
              {translate(
                'hub.applicationActivity.description',
                'Management actions recorded for this application.',
              )}
            </CardDescription>
          </div>
          {canExport ? (
            <Button
              variant='outline'
              nativeButton={false}
              render={<a href={exportUrl} download />}
            >
              <Download aria-hidden='true' />
              {translate('hub.audit.export', 'Export audit CSV')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      {logs.length === 0 ? (
        <CardContent className='py-6'>
          <HubEmptyState
            title={translate(
              'hub.applicationActivity.empty.title',
              'No application activity',
            )}
            description={translate(
              'hub.applicationActivity.empty.description',
              'Management actions for this application will appear here.',
            )}
          />
        </CardContent>
      ) : (
        <CardContent className='overflow-x-auto px-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='pl-4'>
                  {translate('hub.audit.columns.time', 'Time')}
                </TableHead>
                <TableHead>
                  {translate('hub.audit.columns.actor', 'Actor')}
                </TableHead>
                <TableHead>
                  {translate('hub.common.action', 'Action')}
                </TableHead>
                <TableHead>
                  {translate('hub.audit.columns.resource', 'Resource')}
                </TableHead>
                <TableHead>
                  {translate('hub.audit.columns.result', 'Result')}
                </TableHead>
                <TableHead>
                  {translate('hub.common.source', 'Source')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className='pl-4 whitespace-nowrap'>
                    {formatHubDate(log.createdAt)}
                  </TableCell>
                  <TableCell>
                    <p className='font-medium'>
                      {log.actor?.name ??
                        translate('hub.audit.systemActor', 'System')}
                    </p>
                    {log.actor?.email ? (
                      <p className='text-xs text-muted-foreground'>
                        {log.actor.email}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className='font-medium'>
                    {getHubAuditActionLabel(log.action, translate)}
                  </TableCell>
                  <TableCell>
                    <span>
                      {getHubAuditResourceLabel(log.resource, translate)}
                    </span>
                    <p className='max-w-48 truncate font-mono text-xs text-muted-foreground'>
                      {log.resourceId ?? '—'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <HubStatusBadge status={log.result} />
                  </TableCell>
                  <TableCell>
                    {getHubAuditSourceLabel(log.source, translate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
      <HubTablePagination
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </Card>
  );
}

function ApplicationDeployments({
  deployments,
  releases,
  actorNames,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  deployments: HubDeployment[];
  releases: HubRelease[];
  actorNames: Map<string, string>;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const translate = useTranslate();
  if (loading) {
    return (
      <HubLoadingState
        label={translate(
          'hub.applicationDeployments.loading',
          'Loading deployments',
        )}
      />
    );
  }
  if (error) return <HubErrorState error={error} onRetry={onRetry} />;
  if (deployments.length === 0) {
    return (
      <HubEmptyState
        title={translate(
          'hub.applicationDeployments.empty.title',
          'No deployments',
        )}
        description={translate(
          'hub.applicationDeployments.empty.description',
          'A deployment record will appear after a verified release is sent to the default environment.',
        )}
      />
    );
  }
  const versions = new Map(
    releases.map((release) => [release.id, release.version]),
  );

  return (
    <div className='space-y-4'>
      <Card className='py-0'>
        <CardContent className='px-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='pl-4'>
                  {translate(
                    'hub.deployments.columns.deployment',
                    'Deployment',
                  )}
                </TableHead>
                <TableHead>{translate('hub.common.type', 'Type')}</TableHead>
                <TableHead>
                  {translate(
                    'hub.deployments.columns.fromRelease',
                    'From release',
                  )}
                </TableHead>
                <TableHead>
                  {translate('hub.deployments.columns.toRelease', 'To release')}
                </TableHead>
                <TableHead>
                  {translate('hub.common.status', 'Status')}
                </TableHead>
                <TableHead>
                  {translate(
                    'hub.deployments.columns.requestedBy',
                    'Requested by',
                  )}
                </TableHead>
                <TableHead>
                  {translate('hub.common.started', 'Started')}
                </TableHead>
                <TableHead>
                  {translate('hub.deployments.columns.duration', 'Duration')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment) => (
                <TableRow key={deployment.id}>
                  <TableCell className='pl-4'>
                    <Link
                      className='font-mono text-xs underline-offset-4 hover:underline'
                      to={`/deployments/${encodeURIComponent(deployment.id)}`}
                    >
                      {deployment.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {getDeploymentTypeLabel(deployment.type, translate)}
                  </TableCell>
                  <TableCell>
                    {deployment.previousReleaseId
                      ? (versions.get(deployment.previousReleaseId) ??
                        deployment.previousReleaseId)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {versions.get(deployment.targetReleaseId) ??
                      deployment.targetReleaseId}
                  </TableCell>
                  <TableCell>
                    <HubStatusBadge status={deployment.status} />
                  </TableCell>
                  <TableCell>
                    {actorNames.get(deployment.requestedBy) ??
                      deployment.requestedBy}
                  </TableCell>
                  <TableCell>
                    {formatHubDate(
                      deployment.startedAt ?? deployment.createdAt,
                    )}
                  </TableCell>
                  <TableCell>
                    {formatHubDuration(
                      deployment.startedAt,
                      deployment.finishedAt,
                      translate,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <HubLoadMore
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}

function ApplicationDevelopment({
  application,
}: {
  application: HubApplication;
}) {
  const translate = useTranslate();
  const [copied, setCopied] = useState(false);
  const hubUrl = resolveHubPublicUrl();
  const prompt = translateWithValues(
    translate,
    'hub.development.prompt',
    `Develop the NocoBase Hub application “{{name}}” (slug: {{slug}}) from source kept on my local machine.

Hub URL: {{hubUrl}}
Hub stores only build artifacts, Releases, and Deployments. It does not store or restore application source code.

1. Check the local prerequisites. Node.js 24 or later and pnpm 11 or later are required.

node --version
pnpm --version

2. Ask me for the existing local source directory before changing anything. Preserve every local change in that directory. Do not download, pull, or reconstruct source from Hub.

If I confirm that no source directory exists and this APP should start again from the default template, create a new local project in an empty directory:

pnpm create @nocobase/app <directory>

This creates new template source; it does not recover the source used by an existing Release.

3. Enter the confirmed application directory and start the development server:

cd <directory>
pnpm run dev

Keep the development server running while making the requested changes. Record the local URL and verify the relevant user flows in a browser.

4. Implement only the requested application changes. Run focused tests while developing. Before sending anything to Hub, stop the development server if needed and run the complete project checks:

pnpm check

Fix any failure instead of skipping or weakening checks.

5. Choose only the result I requested. These commands build locally and send only the packaged artifact to Hub.

- To create a verified Release without deploying it, validate and then release:

pnpm run release --hub {{hubUrl}} --app {{slug}} --bump patch --dry-run --non-interactive --json
pnpm run release --hub {{hubUrl}} --app {{slug}} --bump patch --non-interactive --json

- To build, create the next patch Release, and deploy it:

pnpm run deploy --hub {{hubUrl}} --app {{slug}} --non-interactive --json

After the first successful association, the Hub and APP arguments are saved locally and may be omitted. Do not deploy unless I explicitly requested deployment. If Device Authorization is required, ask me to approve the browser page. If a Release or Deployment is interrupted, resume with the --operation-id command printed by the script instead of starting a duplicate operation.

6. Report every requested Release or Deployment ID, version, status, URL, checksum, and verification result. Never upload source code, dependencies, local databases, secrets, or runtime data to Hub.`,
    {
      hubUrl,
      name: application.name,
      slug: application.slug,
    },
  );
  return (
    <div className='grid gap-4'>
      <Card>
        <CardHeader>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <CardTitle>
                {translate(
                  'hub.development.title',
                  'Develop with a Coding Agent',
                )}
              </CardTitle>
              <CardDescription>
                {translate(
                  'hub.development.description',
                  'Copy one instruction to your local Coding Agent. Source stays on your machine; only build artifacts are published to Hub.',
                )}
              </CardDescription>
            </div>
            <Button
              type='button'
              onClick={() => {
                void navigator.clipboard?.writeText(prompt).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1_500);
                });
              }}
            >
              <SquareTerminal aria-hidden='true' />
              {copied
                ? translate('hub.development.copied', 'Copied')
                : translate(
                    'hub.development.copy',
                    'Copy development instruction',
                  )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className='max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/35 p-4 font-mono text-xs leading-6'>
            {prompt}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function ApplicationPermissions({
  applicationId,
  access,
  roles,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onLoadMore,
  canAssign,
  canAdd,
  fetcher,
  onChanged,
}: {
  applicationId: string;
  access: HubApplicationAccess[];
  roles: HubRole[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  canAssign: boolean;
  canAdd: boolean;
  fetcher?: HubFetcher;
  onChanged: () => void;
}) {
  const translate = useTranslate();
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<Error | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addMemberId, setAddMemberId] = useState('');
  const [addRoles, setAddRoles] = useState<string[]>([]);
  const members = useHubPageQuery<HubMember>({
    path: addOpen && canAdd ? '/members?status=active&sort=name' : null,
    fetcher,
    enabled: addOpen && canAdd,
  });
  const applicationRoles = roles.flatMap((role) => {
    const roleKey = role.key ?? role.id;
    const supportsApplicationScope = role.scopes
      ? role.scopes.includes('application')
      : role.scope === 'application' ||
        (roleKey !== 'owner' && roleKey !== 'admin');
    if (!roleKey || !supportsApplicationScope) {
      return [];
    }
    return [
      {
        key: roleKey,
        label: getHubRoleLabel(role.name ?? roleKey, translate),
      },
    ];
  });

  const startEditing = (member: HubApplicationAccess) => {
    const memberId = member.memberId ?? member.id;
    if (!memberId) return;
    setUpdateError(null);
    setEditingMemberId(memberId);
    setSelectedRoles(
      member.roles.flatMap((role) => {
        const roleKey =
          typeof role === 'string' ? role : (role.key ?? role.name);
        return roleKey ? [roleKey] : [];
      }),
    );
  };

  const replaceMemberRoles = async (
    memberId: string,
    requestedRoles: string[],
  ) => {
    const encodedApplicationId = encodeURIComponent(applicationId);
    const request = fetcher ?? fetch;
    const revisionResponse = await request(
      buildHubApiUrl(`/apps/${encodedApplicationId}/access?limit=1&offset=0`),
      {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'include',
      },
    );
    if (!revisionResponse.ok) {
      throw new Error(
        translate(
          'hub.permissions.updateError',
          'Unable to update application roles.',
        ),
      );
    }
    const etag = revisionResponse.headers.get('etag');
    if (!etag) {
      throw new Error(
        translate(
          'hub.permissions.missingRevision',
          'The current permission revision is unavailable. Reload and try again.',
        ),
      );
    }
    const orderedRoles = applicationRoles
      .map((role) => role.key)
      .filter((role) => requestedRoles.includes(role));
    await hubRequest(
      `/apps/${encodedApplicationId}/access/${encodeURIComponent(memberId)}`,
      {
        method: 'PUT',
        headers: { 'if-match': etag },
        body: JSON.stringify({ roles: orderedRoles }),
      },
      fetcher,
    );
  };

  const saveRoles = async (memberId: string) => {
    setSavingMemberId(memberId);
    setUpdateError(null);
    try {
      await replaceMemberRoles(memberId, selectedRoles);
      setEditingMemberId(null);
      onChanged();
    } catch (reason) {
      setUpdateError(
        reason instanceof Error ? reason : new Error(String(reason)),
      );
    } finally {
      setSavingMemberId(null);
    }
  };

  const addAuthorization = async () => {
    if (!addMemberId || addRoles.length === 0) return;
    setSavingMemberId(addMemberId);
    setUpdateError(null);
    try {
      await replaceMemberRoles(addMemberId, addRoles);
      setAddOpen(false);
      setAddMemberId('');
      setAddRoles([]);
      onChanged();
    } catch (reason) {
      setUpdateError(
        reason instanceof Error ? reason : new Error(String(reason)),
      );
    } finally {
      setSavingMemberId(null);
    }
  };

  const assignedMemberIds = new Set(
    access.flatMap((member) => {
      const memberId = member.memberId ?? member.id;
      return memberId ? [memberId] : [];
    }),
  );
  const availableMembers = members.data.filter(
    (member) => !assignedMemberIds.has(member.id),
  );

  if (loading)
    return (
      <HubLoadingState
        label={translate('hub.permissions.loading', 'Loading permissions')}
      />
    );
  if (error) return <HubErrorState error={error} onRetry={onRetry} />;
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>
            {translate('hub.permissions.membersTitle', 'Application members')}
          </CardTitle>
          <CardDescription>
            {translate(
              'hub.permissions.membersDescription',
              'Roles below apply only to this application. Global assignments are evaluated by the server as well.',
            )}
          </CardDescription>
          {canAdd ? (
            <div className='mt-3'>
              <Button
                type='button'
                size='sm'
                onClick={() => {
                  setUpdateError(null);
                  setAddMemberId('');
                  setAddRoles([]);
                  setAddOpen(true);
                }}
              >
                {translate(
                  'hub.permissions.addAuthorization',
                  'Add authorization',
                )}
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className='px-0'>
          {updateError ? (
            <Alert variant='destructive' className='mx-6 mb-4'>
              <AlertTitle>
                {translate(
                  'hub.permissions.updateError',
                  'Unable to update application roles',
                )}
              </AlertTitle>
              <AlertDescription>
                {getHubErrorMessage(updateError, translate)}
              </AlertDescription>
            </Alert>
          ) : null}
          {access.length === 0 ? (
            <HubEmptyState
              title={translate(
                'hub.permissions.empty',
                'No application-specific members',
              )}
              description={translate(
                'hub.permissions.emptyDescription',
                'Members with global roles may still have access to this application.',
              )}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='pl-6'>
                    {translate('hub.common.name', 'Name')}
                  </TableHead>
                  <TableHead>
                    {translate('hub.members.email', 'Email')}
                  </TableHead>
                  <TableHead>
                    {translate('hub.members.roles', 'Roles')}
                  </TableHead>
                  <TableHead>
                    {translate('hub.common.status', 'Status')}
                  </TableHead>
                  {canAssign ? (
                    <TableHead className='pr-6 text-right'>
                      {translate('hub.common.actions', 'Actions')}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {access.map((member) => (
                  <TableRow key={member.memberId ?? member.id ?? member.email}>
                    <TableCell className='pl-6 font-medium'>
                      {member.name}
                    </TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      {editingMemberId === (member.memberId ?? member.id) ? (
                        <div className='flex flex-wrap gap-x-4 gap-y-2'>
                          {applicationRoles.map((role) => (
                            <label
                              key={role.key}
                              className='flex items-center gap-2 text-sm'
                            >
                              <Checkbox
                                checked={selectedRoles.includes(role.key)}
                                onCheckedChange={(checked) => {
                                  setSelectedRoles((current) =>
                                    checked
                                      ? [...new Set([...current, role.key])]
                                      : current.filter(
                                          (item) => item !== role.key,
                                        ),
                                  );
                                }}
                              />
                              <span className='capitalize'>{role.label}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        member.roles
                          .map((role) =>
                            getHubRoleLabel(
                              typeof role === 'string'
                                ? role
                                : (role.name ?? role.key ?? 'role'),
                              translate,
                            ),
                          )
                          .join(', ') || '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <HubStatusBadge status={member.status} />
                    </TableCell>
                    {canAssign ? (
                      <TableCell className='pr-6 text-right'>
                        {editingMemberId === (member.memberId ?? member.id) ? (
                          <div className='flex justify-end gap-2'>
                            <Button
                              size='sm'
                              variant='ghost'
                              disabled={savingMemberId !== null}
                              onClick={() => {
                                setEditingMemberId(null);
                                setUpdateError(null);
                              }}
                            >
                              {translate(
                                'hub.permissions.cancelEdit',
                                'Cancel',
                              )}
                            </Button>
                            <Button
                              size='sm'
                              disabled={savingMemberId !== null}
                              onClick={() => {
                                const memberId = member.memberId ?? member.id;
                                if (memberId) void saveRoles(memberId);
                              }}
                            >
                              {savingMemberId === (member.memberId ?? member.id)
                                ? translate(
                                    'hub.permissions.savingRoles',
                                    'Saving…',
                                  )
                                : translate(
                                    'hub.permissions.saveRoles',
                                    'Save roles',
                                  )}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={!member.memberId && !member.id}
                            onClick={() => startEditing(member)}
                          >
                            {translate(
                              'hub.permissions.editRoles',
                              'Edit roles',
                            )}
                          </Button>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <HubLoadMore
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open && savingMemberId === null) setAddOpen(false);
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {translate(
                'hub.permissions.addAuthorizationTitle',
                'Add application authorization',
              )}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'hub.permissions.addAuthorizationDescription',
                'Choose an active Hub member and the roles they can use in this application.',
              )}
            </DialogDescription>
          </DialogHeader>
          {members.error ? (
            <HubErrorState error={members.error} onRetry={members.reload} />
          ) : members.loading ? (
            <HubLoadingState
              label={translate(
                'hub.permissions.membersLoading',
                'Loading members',
              )}
            />
          ) : (
            <div className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='hub-add-authorization-member'>
                  {translate('hub.permissions.member', 'Member')}
                </Label>
                <NativeSelect
                  id='hub-add-authorization-member'
                  aria-label={translate('hub.permissions.member', 'Member')}
                  value={addMemberId}
                  onChange={(event) => setAddMemberId(event.target.value)}
                  className='w-full'
                >
                  <NativeSelectOption value=''>
                    {translate(
                      'hub.permissions.selectMember',
                      'Select a member',
                    )}
                  </NativeSelectOption>
                  {availableMembers.map((member) => (
                    <NativeSelectOption key={member.id} value={member.id}>
                      {member.name} ({member.email})
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {availableMembers.length === 0 ? (
                  <p className='text-xs text-muted-foreground'>
                    {translate(
                      'hub.permissions.noAvailableMembers',
                      'All active members already have application-specific access.',
                    )}
                  </p>
                ) : null}
              </div>
              <fieldset className='space-y-2'>
                <legend className='text-sm font-medium'>
                  {translate('hub.permissions.roles', 'Roles')}
                </legend>
                {applicationRoles.map((role) => (
                  <label
                    key={role.key}
                    className='flex items-center gap-2 text-sm'
                  >
                    <Checkbox
                      checked={addRoles.includes(role.key)}
                      onCheckedChange={(checked) =>
                        setAddRoles((current) =>
                          checked
                            ? [...new Set([...current, role.key])]
                            : current.filter((item) => item !== role.key),
                        )
                      }
                    />
                    <span>{role.label}</span>
                  </label>
                ))}
              </fieldset>
              {updateError ? (
                <Alert variant='destructive'>
                  <AlertTitle>
                    {translate(
                      'hub.permissions.updateError',
                      'Unable to update application roles',
                    )}
                  </AlertTitle>
                  <AlertDescription>
                    {getHubErrorMessage(updateError, translate)}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={savingMemberId !== null}
              onClick={() => setAddOpen(false)}
            >
              {translate('hub.common.cancel', 'Cancel')}
            </Button>
            <Button
              type='button'
              disabled={
                savingMemberId !== null ||
                !addMemberId ||
                addRoles.length === 0 ||
                members.loading
              }
              onClick={() => void addAuthorization()}
            >
              {savingMemberId === addMemberId
                ? translate('hub.common.saving', 'Saving…')
                : translate(
                    'hub.permissions.saveAuthorization',
                    'Save authorization',
                  )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card>
        <CardHeader>
          <CardTitle>
            {translate('hub.permissions.rolesTitle', 'Built-in roles')}
          </CardTitle>
          <CardDescription>
            {translate(
              'hub.permissions.rolesDescription',
              'Roles are read-only capability sets. Deployer controls deployments; Developer publishes build artifacts as Releases.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {roles.map((role) => {
            const roleKey = role.key ?? role.id ?? role.name ?? 'role';
            return (
              <div key={roleKey} className='rounded-lg border p-4'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='font-medium capitalize'>
                    {getHubRoleLabel(role.name ?? roleKey, translate)}
                  </p>
                  <Badge variant='outline'>
                    {getHubRoleScopeLabel(role.scope, translate)}
                  </Badge>
                </div>
                <div className='mt-3 flex flex-wrap gap-1.5'>
                  {role.capabilities.flatMap((capability) =>
                    capability.actions.map((action) => (
                      <Badge
                        key={`${capability.resource}:${action}`}
                        variant='secondary'
                      >
                        {getHubCapabilityResourceLabel(
                          capability.resource,
                          translate,
                        )}
                        : {getHubCapabilityActionLabel(action, translate)}
                      </Badge>
                    )),
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function ApplicationSettings({
  application,
  runtime,
  runtimeLoading,
  runtimeSecret,
  canUpdate,
  canArchive,
  canRestore,
  canControlRuntime,
  canRotateRuntimeSecret,
  confirmation,
  fetcher,
  onChanged,
}: {
  application: HubApplication;
  runtime: HubRuntime | null;
  runtimeLoading: boolean;
  runtimeSecret: HubRuntimeSecretSummary | null;
  canUpdate: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canControlRuntime: boolean;
  canRotateRuntimeSecret: boolean;
  confirmation?: HubSettings['confirmation'];
  fetcher?: HubFetcher;
  onChanged: () => void;
}) {
  const translate = useTranslate();
  const [name, setName] = useState(application.name);
  const [description, setDescription] = useState(application.description ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pendingAction, setPendingAction] =
    useState<ApplicationSettingsAction | null>(null);
  const encodedId = encodeURIComponent(application.id);
  const revisionHeaders = application.revision
    ? { 'if-match': `"rev-${application.revision}"` }
    : undefined;
  const run = (
    key: string,
    request: () => Promise<unknown>,
    onSuccess?: () => void,
  ) => {
    setBusy(key);
    setError(null);
    void request()
      .then(() => {
        onSuccess?.();
        onChanged();
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason : new Error(String(reason))),
      )
      .finally(() => setBusy(null));
  };
  const executeAction = (action: ApplicationSettingsAction) => {
    run(
      action,
      () =>
        createApplicationSettingsActionRequest({
          action,
          encodedId,
          fetcher,
          revisionHeaders,
        }),
      () => setPendingAction(null),
    );
  };
  const requestAction = (
    action: ApplicationSettingsAction,
    confirmationEnabled = true,
  ) => {
    setError(null);
    if (!confirmationEnabled) {
      executeAction(action);
      return;
    }
    setPendingAction(action);
  };
  const actionCopy = pendingAction
    ? getApplicationSettingsActionCopy(
        pendingAction,
        application.name,
        translate,
      )
    : null;

  return (
    <div className='grid gap-4 xl:grid-cols-2'>
      {error && !pendingAction ? (
        <div className='xl:col-span-2'>
          <HubErrorState error={error} />
        </div>
      ) : null}
      {canUpdate ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {translate(
                'hub.applicationSettings.profile',
                'Application profile',
              )}
            </CardTitle>
            <CardDescription>
              {translate(
                'hub.applicationSettings.slugImmutable',
                'The application slug is its stable URL and deployment identity and cannot be changed.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='application-settings-name'>
                {translate('hub.common.name', 'Name')}
              </Label>
              <Input
                id='application-settings-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='application-settings-slug'>
                {translate('hub.common.slug', 'Slug')}
              </Label>
              <Input
                id='application-settings-slug'
                value={application.slug}
                readOnly
                disabled
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='application-settings-description'>
                {translate('hub.common.description', 'Description')}
              </Label>
              <Textarea
                id='application-settings-description'
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <Button
              disabled={busy !== null || !name.trim()}
              onClick={() =>
                run('save', () =>
                  hubPatch(
                    `/apps/${encodedId}`,
                    {
                      name: name.trim(),
                      description: description.trim() || null,
                    },
                    fetcher,
                    revisionHeaders,
                  ),
                )
              }
            >
              {busy === 'save' ? (
                <Spinner aria-hidden='true' />
              ) : (
                <Settings2 aria-hidden='true' />
              )}
              {busy === 'save'
                ? translate('hub.applicationSettings.saving', 'Saving…')
                : translate('hub.applicationSettings.save', 'Save changes')}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {runtimeLoading ? (
        <HubLoadingState
          label={translate('hub.runtime.loading', 'Loading runtime')}
        />
      ) : runtime ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {translate('hub.runtime.title', 'Runtime and health')}
            </CardTitle>
            <CardDescription>
              {translate(
                'hub.runtime.snapshotDescription',
                'This is the latest observed snapshot, not a historical availability trend.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-wrap gap-2'>
              <HubStatusBadge status={runtime.state} />
              <HubStatusBadge status={runtime.health} />
            </div>
            <dl className='grid grid-cols-2 gap-4 text-sm'>
              <Detail
                label={translate('hub.common.release', 'Release')}
                value={runtime.releaseVersion ?? runtime.releaseId ?? '—'}
              />
              <Detail
                label={translate('hub.runtime.lastChecked', 'Last checked')}
                value={formatHubDate(runtime.lastCheckedAt)}
              />
              <Detail
                label={translate('hub.runtime.startedAt', 'Started')}
                value={formatHubDate(runtime.startedAt)}
              />
              <Detail
                label={translate(
                  'hub.runtime.activeRequests',
                  'Active requests',
                )}
                value={String(runtime.activeRequests ?? 0)}
              />
            </dl>
            {canControlRuntime ? (
              <div className='flex flex-wrap gap-2'>
                {runtime.state === 'stopped' ? (
                  <Button
                    variant='outline'
                    disabled={busy !== null}
                    onClick={() => requestAction('start')}
                  >
                    {busy === 'start' ? <Spinner aria-hidden='true' /> : null}
                    {busy === 'start'
                      ? translate('hub.runtime.starting', 'Starting…')
                      : translate('hub.runtime.start', 'Start')}
                  </Button>
                ) : null}
                {runtime.state === 'running' ? (
                  <Button
                    variant='outline'
                    disabled={busy !== null}
                    onClick={() => requestAction('restart')}
                  >
                    {busy === 'restart' ? <Spinner aria-hidden='true' /> : null}
                    {busy === 'restart'
                      ? translate('hub.runtime.restarting', 'Restarting…')
                      : translate('hub.runtime.restart', 'Restart')}
                  </Button>
                ) : null}
                {runtime.state === 'running' || runtime.state === 'idle' ? (
                  <Button
                    variant='outline'
                    disabled={busy !== null}
                    onClick={() => requestAction('stop')}
                  >
                    {busy === 'stop' ? <Spinner aria-hidden='true' /> : null}
                    {busy === 'stop'
                      ? translate('hub.runtime.stopping', 'Stopping…')
                      : translate('hub.runtime.stop', 'Stop application')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {runtimeSecret ? (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <KeyRound className='size-4' />
              {translate('hub.runtimeSecret.title', 'Runtime secret')}
            </CardTitle>
            <CardDescription>
              {translate(
                'hub.runtimeSecret.description',
                'Each application has an independent signing secret. Hub never displays its value.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <dl className='grid grid-cols-2 gap-4 text-sm'>
              <Detail
                label={translate('hub.runtimeSecret.version', 'Version')}
                value={String(runtimeSecret.version)}
              />
              <Detail
                label={translate('hub.runtimeSecret.rotatedAt', 'Last rotated')}
                value={formatHubDate(runtimeSecret.rotatedAt)}
              />
            </dl>
            {canRotateRuntimeSecret ? (
              <Button
                variant='outline'
                disabled={busy !== null}
                onClick={() =>
                  requestAction(
                    'rotate',
                    confirmation?.rotateRuntimeSecret !== false,
                  )
                }
              >
                {busy === 'rotate' ? <Spinner aria-hidden='true' /> : null}
                {busy === 'rotate'
                  ? translate('hub.runtimeSecret.rotating', 'Rotating…')
                  : translate('hub.runtimeSecret.rotate', 'Rotate secret')}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {canArchive || canRestore ? (
        <Card className='border-destructive/40'>
          <CardHeader>
            <CardTitle>
              {translate(
                'hub.applicationSettings.lifecycle',
                'Application lifecycle',
              )}
            </CardTitle>
            <CardDescription>
              {translate(
                'hub.applicationSettings.archiveDescription',
                'Archiving disables publishing and deployment while preserving Releases, data, and history.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {application.status === 'archived' && canRestore ? (
              <Button
                disabled={busy !== null}
                onClick={() => requestAction('restore')}
              >
                {busy === 'restore' ? <Spinner aria-hidden='true' /> : null}
                {busy === 'restore'
                  ? translate('hub.applicationSettings.restoring', 'Restoring…')
                  : translate(
                      'hub.applicationSettings.restore',
                      'Restore application',
                    )}
              </Button>
            ) : canArchive ? (
              <Button
                variant='destructive'
                disabled={busy !== null}
                onClick={() =>
                  requestAction(
                    'archive',
                    confirmation?.archiveApplication !== false,
                  )
                }
              >
                {busy === 'archive' ? <Spinner aria-hidden='true' /> : null}
                {busy === 'archive'
                  ? translate('hub.applicationSettings.archiving', 'Archiving…')
                  : translate(
                      'hub.applicationSettings.archive',
                      'Archive application',
                    )}
              </Button>
            ) : null}
          </CardContent>
        </Card>
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
              variant={pendingAction === 'archive' ? 'destructive' : 'default'}
              disabled={busy !== null || pendingAction === null}
              onClick={(event) => {
                event.preventDefault();
                if (pendingAction) executeAction(pendingAction);
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

type ApplicationSettingsAction =
  'start' | 'restart' | 'stop' | 'rotate' | 'archive' | 'restore';

interface ApplicationSettingsActionRequestOptions {
  action: ApplicationSettingsAction;
  encodedId: string;
  fetcher?: HubFetcher;
  revisionHeaders?: HeadersInit;
}

function createApplicationSettingsActionRequest({
  action,
  encodedId,
  fetcher,
  revisionHeaders,
}: ApplicationSettingsActionRequestOptions): Promise<unknown> {
  if (action === 'start' || action === 'stop') {
    return hubPost(`/apps/${encodedId}/runtime/${action}`, {}, fetcher);
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
    );
  }
  if (action === 'rotate') {
    return hubRequest(
      `/apps/${encodedId}/runtime-secret/rotate`,
      {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: '{}',
      },
      fetcher,
    );
  }
  return hubRequest(
    `/apps/${encodedId}/${action}`,
    { method: 'POST', headers: revisionHeaders, body: '{}' },
    fetcher,
  );
}

interface ApplicationSettingsActionCopy {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  errorTitle: string;
}

function getApplicationSettingsActionCopy(
  action: ApplicationSettingsAction,
  applicationName: string,
  translate: ReturnType<typeof useTranslate>,
): ApplicationSettingsActionCopy {
  const values = { name: applicationName };
  const definitions: Record<
    ApplicationSettingsAction,
    Record<
      keyof ApplicationSettingsActionCopy,
      readonly [i18nKey: string, fallback: string]
    >
  > = {
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
    rotate: {
      title: ['hub.runtimeSecret.confirmTitle', 'Rotate runtime secret'],
      description: [
        'hub.runtimeSecret.confirm',
        'Rotating the secret signs all existing application sessions out. Continue?',
      ],
      confirmLabel: ['hub.runtimeSecret.confirmAction', 'Confirm rotation'],
      pendingLabel: ['hub.runtimeSecret.rotating', 'Rotating…'],
      errorTitle: ['hub.runtimeSecret.rotateError', 'Unable to rotate secret'],
    },
    archive: {
      title: ['hub.applicationSettings.archiveTitle', 'Archive application'],
      description: [
        'hub.applicationSettings.archiveConfirmDescription',
        'Archive {{name}}? Publishing and deployment will be disabled, but its Releases, data, and history will be preserved.',
      ],
      confirmLabel: [
        'hub.applicationSettings.archiveAction',
        'Confirm archive',
      ],
      pendingLabel: ['hub.applicationSettings.archiving', 'Archiving…'],
      errorTitle: [
        'hub.applicationSettings.archiveError',
        'Unable to archive application',
      ],
    },
    restore: {
      title: ['hub.applicationSettings.restoreTitle', 'Restore application'],
      description: [
        'hub.applicationSettings.restoreConfirmDescription',
        'Restore {{name}} and allow publishing and deployment again?',
      ],
      confirmLabel: [
        'hub.applicationSettings.restoreAction',
        'Confirm restore',
      ],
      pendingLabel: ['hub.applicationSettings.restoring', 'Restoring…'],
      errorTitle: [
        'hub.applicationSettings.restoreError',
        'Unable to restore application',
      ],
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

function resolveHubPublicUrl(): string {
  if (typeof window === 'undefined') return getHubBrowserBase() || '/';
  return new URL(getHubBrowserBase() || '/', window.location.origin).toString();
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd
        className={
          mono ? 'mt-1 break-all font-mono text-xs' : 'mt-1 font-medium'
        }
      >
        {value}
      </dd>
    </div>
  );
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

export default ApplicationDetailPage;

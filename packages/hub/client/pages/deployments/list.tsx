import { Activity, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslate } from '@refinedev/core';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import {
  type HubApplication,
  type HubDeployment,
  type HubFetcher,
  hasHubCapability,
} from '@/features/hub/api';
import {
  formatHubDate,
  HubEmptyState,
  HubErrorState,
  HubLoadMore,
  HubListSkeleton,
  HubStatusBadge,
} from '@/features/hub/components';
import { useHubPaginatedQuery } from '@/features/hub/pagination';
import { useOptionalHubRuntime } from '@/features/hub/provider';
import { getDeploymentTypeLabel } from '@/features/hub/status';

export interface DeploymentsPageProps {
  fetcher?: HubFetcher;
}

export function DeploymentsPage({ fetcher }: DeploymentsPageProps) {
  const translate = useTranslate();
  const runtime = useOptionalHubRuntime();
  const capabilities = runtime?.me.capabilities;
  const canReadGlobalDeployments = hasHubCapability(
    capabilities,
    'hub.deployment',
    'read',
  );
  const scopedApplicationId = (capabilities?.application ?? []).find((entry) =>
    hasHubCapability(
      capabilities,
      'hub.deployment',
      'read',
      entry.applicationId,
    ),
  )?.applicationId;
  const deploymentPath =
    runtime && !canReadGlobalDeployments
      ? scopedApplicationId
        ? `/apps/${encodeURIComponent(scopedApplicationId)}/deployments`
        : null
      : '/deployments';
  const deployments = useHubPaginatedQuery<HubDeployment>({
    path: deploymentPath,
    fetcher,
  });
  const canReadGlobalApplications = hasHubCapability(
    capabilities,
    'hub.app',
    'read',
  );
  const applications = useHubPaginatedQuery<HubApplication>({
    path: runtime && !canReadGlobalApplications ? null : '/apps',
    fetcher,
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [applicationId, setApplicationId] = useState('all');
  const applicationNames = useMemo(
    () => new Map((applications.data ?? []).map((app) => [app.id, app.name])),
    [applications.data],
  );
  const {
    hasMore: hasMoreApplications,
    loadMore: loadMoreApplications,
    loading: applicationsLoading,
    loadingMore: applicationsLoadingMore,
  } = applications;

  useEffect(() => {
    if (
      hasMoreApplications &&
      !applicationsLoading &&
      !applicationsLoadingMore
    ) {
      loadMoreApplications();
    }
  }, [
    applicationsLoading,
    applicationsLoadingMore,
    hasMoreApplications,
    loadMoreApplications,
  ]);
  const visibleDeployments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (deployments.data ?? []).filter((deployment) => {
      const matchesStatus = status === 'all' || deployment.status === status;
      const matchesApplication =
        applicationId === 'all' || deployment.applicationId === applicationId;
      const applicationName =
        applicationNames.get(deployment.applicationId) ?? '';
      const matchesSearch =
        !query ||
        deployment.id.toLowerCase().includes(query) ||
        deployment.targetReleaseId.toLowerCase().includes(query) ||
        applicationName.toLowerCase().includes(query);
      return matchesStatus && matchesApplication && matchesSearch;
    });
  }, [applicationId, applicationNames, deployments.data, search, status]);

  return (
    <div className='space-y-6'>
      <header className='space-y-1'>
        <div className='flex items-center gap-2 text-muted-foreground'>
          <Activity className='size-4' aria-hidden='true' />
          <span className='text-sm font-medium'>
            {translate('hub.deployments.eyebrow', 'Operations')}
          </span>
        </div>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {translate('hub.deployments.title', 'Deployments')}
        </h1>
        <p className='max-w-2xl text-sm text-muted-foreground'>
          {translate(
            'hub.deployments.description',
            'Follow deployments and rollbacks across every application and inspect the complete execution timeline.',
          )}
        </p>
      </header>

      {deployments.error ? (
        <HubErrorState error={deployments.error} onRetry={deployments.reload} />
      ) : deployments.loading ? (
        <HubListSkeleton rows={6} />
      ) : (deployments.data?.length ?? 0) === 0 ? (
        <HubEmptyState
          title={translate('hub.deployments.empty.title', 'No deployments yet')}
          description={translate(
            'hub.deployments.empty.description',
            'Deploy a verified application release to create the first operation record.',
          )}
        />
      ) : (
        <>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
            <label className='relative min-w-0 flex-1 lg:max-w-sm'>
              <span className='sr-only'>
                {translate(
                  'hub.deployments.search.label',
                  'Search deployments',
                )}
              </span>
              <Search
                className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
                aria-hidden='true'
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={translate(
                  'hub.deployments.search.placeholder',
                  'Search deployment or release',
                )}
                className='pl-8'
              />
            </label>
            <div className='flex flex-wrap gap-3'>
              <NativeSelect
                value={applicationId}
                onChange={(event) => setApplicationId(event.target.value)}
                aria-label={translate(
                  'hub.deployments.filter.applicationAria',
                  'Filter by application',
                )}
              >
                <NativeSelectOption value='all'>
                  {translate(
                    'hub.deployments.filter.allApplications',
                    'All applications',
                  )}
                </NativeSelectOption>
                {(applications.data ?? []).map((application) => (
                  <NativeSelectOption
                    key={application.id}
                    value={application.id}
                  >
                    {application.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label={translate(
                  'hub.deployments.filter.statusAria',
                  'Filter by deployment status',
                )}
              >
                <NativeSelectOption value='all'>
                  {translate(
                    'hub.deployments.filter.allStatuses',
                    'All statuses',
                  )}
                </NativeSelectOption>
                <NativeSelectOption value='queued'>
                  {translate('hub.status.queued', 'Queued')}
                </NativeSelectOption>
                <NativeSelectOption value='preparing'>
                  {translate('hub.status.preparing', 'Preparing')}
                </NativeSelectOption>
                <NativeSelectOption value='checking'>
                  {translate('hub.status.checking', 'Checking')}
                </NativeSelectOption>
                <NativeSelectOption value='switching'>
                  {translate('hub.status.switching', 'Switching')}
                </NativeSelectOption>
                <NativeSelectOption value='draining'>
                  {translate('hub.status.draining', 'Draining')}
                </NativeSelectOption>
                <NativeSelectOption value='succeeded'>
                  {translate('hub.status.succeeded', 'Succeeded')}
                </NativeSelectOption>
                <NativeSelectOption value='failed'>
                  {translate('hub.status.failed', 'Failed')}
                </NativeSelectOption>
                <NativeSelectOption value='cancelled'>
                  {translate('hub.status.cancelled', 'Cancelled')}
                </NativeSelectOption>
              </NativeSelect>
            </div>
          </div>

          {visibleDeployments.length === 0 ? (
            <HubEmptyState
              title={translate(
                'hub.deployments.noMatches.title',
                'No matching deployments',
              )}
              description={translate(
                'hub.deployments.noMatches.description',
                'Change the filters to see other deployment records.',
              )}
            />
          ) : (
            <DeploymentResults
              deployments={visibleDeployments}
              applicationNames={applicationNames}
            />
          )}
          <p className='text-xs text-muted-foreground'>
            {translate(
              'hub.deployments.summary',
              {
                visible: visibleDeployments.length,
                total: deployments.meta?.total ?? deployments.data?.length ?? 0,
              },
              'Showing {{visible}} of {{total}} deployments',
            )}
          </p>
          <HubLoadMore
            hasMore={deployments.hasMore}
            loading={deployments.loadingMore}
            onLoadMore={deployments.loadMore}
          />
        </>
      )}
    </div>
  );
}

function DeploymentResults({
  deployments,
  applicationNames,
}: {
  deployments: HubDeployment[];
  applicationNames: Map<string, string>;
}) {
  const translate = useTranslate();
  return (
    <>
      <Card className='hidden py-0 md:block'>
        <CardContent className='px-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='pl-4'>
                  {translate('hub.common.application', 'Application')}
                </TableHead>
                <TableHead>
                  {translate(
                    'hub.deployments.columns.targetRelease',
                    'Target release',
                  )}
                </TableHead>
                <TableHead>
                  {translate('hub.common.environment', 'Environment')}
                </TableHead>
                <TableHead>{translate('hub.common.type', 'Type')}</TableHead>
                <TableHead>
                  {translate('hub.common.status', 'Status')}
                </TableHead>
                <TableHead>
                  {translate('hub.common.started', 'Started')}
                </TableHead>
                <TableHead>
                  {translate(
                    'hub.deployments.columns.requestedBy',
                    'Requested by',
                  )}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment) => (
                <TableRow key={deployment.id}>
                  <TableCell className='pl-4'>
                    <Link
                      className='font-medium underline-offset-4 hover:underline'
                      to={`/deployments/${encodeURIComponent(deployment.id)}`}
                    >
                      {applicationNames.get(deployment.applicationId) ??
                        deployment.applicationId}
                    </Link>
                    <p className='font-mono text-xs text-muted-foreground'>
                      {deployment.id}
                    </p>
                  </TableCell>
                  <TableCell className='font-mono text-xs'>
                    {deployment.targetReleaseId}
                  </TableCell>
                  <TableCell>{deployment.environmentId}</TableCell>
                  <TableCell className='capitalize'>
                    {getDeploymentTypeLabel(deployment.type, translate)}
                  </TableCell>
                  <TableCell>
                    <HubStatusBadge status={deployment.status} />
                  </TableCell>
                  <TableCell>
                    {formatHubDate(
                      deployment.startedAt ?? deployment.createdAt,
                    )}
                  </TableCell>
                  <TableCell>{deployment.requestedBy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className='grid gap-3 md:hidden'>
        {deployments.map((deployment) => (
          <Card key={deployment.id} size='sm'>
            <CardContent className='space-y-3'>
              <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <Link
                    className='font-medium underline-offset-4 hover:underline'
                    to={`/deployments/${encodeURIComponent(deployment.id)}`}
                  >
                    {applicationNames.get(deployment.applicationId) ??
                      deployment.applicationId}
                  </Link>
                  <p className='truncate font-mono text-xs text-muted-foreground'>
                    {deployment.id}
                  </p>
                </div>
                <HubStatusBadge status={deployment.status} />
              </div>
              <dl className='grid grid-cols-2 gap-3 text-xs'>
                <div>
                  <dt className='text-muted-foreground'>
                    {translate('hub.common.environment', 'Environment')}
                  </dt>
                  <dd className='mt-1 font-medium'>
                    {deployment.environmentId}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {translate('hub.common.started', 'Started')}
                  </dt>
                  <dd className='mt-1 font-medium'>
                    {formatHubDate(
                      deployment.startedAt ?? deployment.createdAt,
                    )}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

export default DeploymentsPage;

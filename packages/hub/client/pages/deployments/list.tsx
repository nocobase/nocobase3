import { Activity, Download, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslate } from '@refinedev/core';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import {
  type HubApplication,
  type HubCapabilities,
  type HubDeployment,
  type HubFetcher,
  type HubMember,
  type HubRelease,
  buildHubApiUrl,
  hasHubCapability,
  hubGet,
} from '@/features/hub/api';
import {
  formatHubDate,
  formatHubDuration,
  HubEmptyState,
  HubErrorState,
  HubListSkeleton,
  HubStatusBadge,
} from '@/features/hub/components';
import {
  HubPageHeader,
  HubTablePagination,
} from '@/features/hub/management-components';
import {
  useHubPageQuery,
  useHubPaginatedQuery,
} from '@/features/hub/pagination';
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
  const baseDeploymentPath =
    runtime && !canReadGlobalDeployments
      ? scopedApplicationId
        ? `/apps/${encodeURIComponent(scopedApplicationId)}/deployments`
        : null
      : '/deployments';
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState('all');
  const [applicationId, setApplicationId] = useState('all');
  const [type, setType] = useState('all');
  const [requestedBy, setRequestedBy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('-createdAt');
  const deploymentPath = useMemo(() => {
    if (!baseDeploymentPath) return null;
    const params = new URLSearchParams();
    if (deferredSearch.trim()) params.set('query', deferredSearch.trim());
    if (status !== 'all') params.set('status', status);
    if (applicationId !== 'all' && (!runtime || canReadGlobalDeployments))
      params.set('applicationId', applicationId);
    if (type !== 'all') params.set('type', type);
    if (requestedBy.trim()) params.set('requestedBy', requestedBy.trim());
    const fromIso = toIsoDateTime(from);
    const toIso = toIsoDateTime(to);
    if (fromIso) params.set('from', fromIso);
    if (toIso) params.set('to', toIso);
    if (sort !== '-createdAt') params.set('sort', sort);
    const query = params.toString();
    return query ? `${baseDeploymentPath}?${query}` : baseDeploymentPath;
  }, [
    applicationId,
    baseDeploymentPath,
    canReadGlobalDeployments,
    deferredSearch,
    from,
    requestedBy,
    runtime,
    sort,
    status,
    to,
    type,
  ]);
  const canExport =
    !runtime || canReadGlobalDeployments || Boolean(scopedApplicationId);
  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (deferredSearch.trim()) params.set('query', deferredSearch.trim());
    if (status !== 'all') params.set('status', status);
    if (applicationId !== 'all' && (!runtime || canReadGlobalDeployments)) {
      params.set('applicationId', applicationId);
    } else if (runtime && !canReadGlobalDeployments && scopedApplicationId) {
      params.set('applicationId', scopedApplicationId);
    }
    if (type !== 'all') params.set('type', type);
    if (requestedBy.trim()) params.set('requestedBy', requestedBy.trim());
    const fromIso = toIsoDateTime(from);
    const toIso = toIsoDateTime(to);
    if (fromIso) params.set('from', fromIso);
    if (toIso) params.set('to', toIso);
    if (sort !== '-createdAt') params.set('sort', sort);
    const query = params.toString();
    return buildHubApiUrl(
      query ? `/deployments.csv?${query}` : '/deployments.csv',
    );
  }, [
    applicationId,
    canReadGlobalDeployments,
    deferredSearch,
    from,
    requestedBy,
    runtime,
    scopedApplicationId,
    sort,
    status,
    to,
    type,
  ]);
  const deployments = useHubPageQuery<HubDeployment>({
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
  const visibleDeployments = deployments.data ?? [];
  const references = useDeploymentReferences(
    visibleDeployments,
    capabilities,
    fetcher,
  );

  return (
    <div className='hub-page'>
      <HubPageHeader
        eyebrow={
          <>
            <Activity aria-hidden='true' />
            {translate('hub.deployments.eyebrow', 'Operations')}
          </>
        }
        title={translate('hub.deployments.title', 'Deployments')}
        description={translate(
          'hub.deployments.description',
          'Follow deployments and rollbacks across every application and inspect the complete execution timeline.',
        )}
        actions={
          canExport ? (
            <Button
              variant='outline'
              nativeButton={false}
              render={<a href={exportUrl} download />}
            >
              <Download aria-hidden='true' />
              {translate('hub.deployments.export', 'Export deployment CSV')}
            </Button>
          ) : undefined
        }
      />

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
          <div className='hub-filter-panel space-y-3'>
            <div className='flex flex-col gap-3 xl:flex-row xl:items-center'>
              <label className='relative min-w-0 flex-1 lg:min-w-64 lg:max-w-md'>
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
              <div className='grid gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap'>
                <NativeSelect
                  className='w-full xl:w-fit'
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
                  className='w-full xl:w-fit'
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
                <NativeSelect
                  className='w-full xl:w-fit'
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  aria-label={translate(
                    'hub.deployments.filter.typeAria',
                    'Filter by deployment type',
                  )}
                >
                  <NativeSelectOption value='all'>
                    {translate('hub.deployments.filter.allTypes', 'All types')}
                  </NativeSelectOption>
                  {['deploy', 'rollback', 'redeploy'].map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {getDeploymentTypeLabel(value, translate)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <NativeSelect
                  className='w-full xl:w-fit'
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  aria-label={translate(
                    'hub.deployments.filter.sortAria',
                    'Sort deployments',
                  )}
                >
                  <NativeSelectOption value='-createdAt'>
                    {translate(
                      'hub.deployments.filter.sort.createdNewest',
                      'Created: newest first',
                    )}
                  </NativeSelectOption>
                  <NativeSelectOption value='createdAt'>
                    {translate(
                      'hub.deployments.filter.sort.createdOldest',
                      'Created: oldest first',
                    )}
                  </NativeSelectOption>
                  <NativeSelectOption value='-startedAt'>
                    {translate(
                      'hub.deployments.filter.sort.startedNewest',
                      'Started: newest first',
                    )}
                  </NativeSelectOption>
                  <NativeSelectOption value='startedAt'>
                    {translate(
                      'hub.deployments.filter.sort.startedOldest',
                      'Started: oldest first',
                    )}
                  </NativeSelectOption>
                  <NativeSelectOption value='-finishedAt'>
                    {translate(
                      'hub.deployments.filter.sort.finishedNewest',
                      'Finished: newest first',
                    )}
                  </NativeSelectOption>
                  <NativeSelectOption value='finishedAt'>
                    {translate(
                      'hub.deployments.filter.sort.finishedOldest',
                      'Finished: oldest first',
                    )}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
            </div>

            <div className='grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-3'>
              <DeploymentTextFilter
                id='hub-deployment-requested-by'
                label={translate(
                  'hub.deployments.filter.requestedBy',
                  'Requested by',
                )}
                value={requestedBy}
                onChange={setRequestedBy}
              />
              <DeploymentDateFilter
                id='hub-deployment-from'
                label={translate('hub.deployments.filter.from', 'From')}
                value={from}
                onChange={setFrom}
              />
              <DeploymentDateFilter
                id='hub-deployment-to'
                label={translate('hub.deployments.filter.to', 'To')}
                value={to}
                onChange={setTo}
              />
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
              releaseVersions={references.releaseVersions}
              memberNames={references.memberNames}
            />
          )}
          <p className='border-t border-border/60 pt-4 text-xs text-muted-foreground'>
            {translate(
              'hub.deployments.summary',
              {
                visible: visibleDeployments.length,
                total: deployments.meta?.total ?? deployments.data?.length ?? 0,
              },
              'Showing {{visible}} of {{total}} deployments',
            )}
          </p>
          <HubTablePagination
            page={deployments.page}
            pageCount={deployments.pageCount}
            pageSize={deployments.pageSize}
            total={deployments.total}
            onPageChange={deployments.setPage}
            onPageSizeChange={deployments.setPageSize}
          />
        </>
      )}
    </div>
  );
}

function DeploymentTextFilter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className='space-y-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function DeploymentDateFilter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className='space-y-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type='datetime-local'
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function toIsoDateTime(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toISOString();
}

function DeploymentResults({
  deployments,
  applicationNames,
  releaseVersions,
  memberNames,
}: {
  deployments: HubDeployment[];
  applicationNames: Map<string, string>;
  releaseVersions: Map<string, string>;
  memberNames: Map<string, string>;
}) {
  const translate = useTranslate();
  return (
    <>
      <Card className='hub-table-card hidden py-0 md:block'>
        <CardContent className='px-0'>
          <Table className='min-w-[980px]'>
            <TableHeader>
              <TableRow>
                <TableHead className='pl-4'>
                  {translate(
                    'hub.deployments.columns.deployment',
                    'Deployment',
                  )}
                </TableHead>
                <TableHead>
                  {translate('hub.common.application', 'Application')}
                </TableHead>
                <TableHead>
                  {translate(
                    'hub.deployments.columns.fromRelease',
                    'From release',
                  )}
                </TableHead>
                <TableHead>
                  {translate('hub.deployments.columns.toRelease', 'To release')}
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
                  <TableCell className='font-medium'>
                    {applicationNames.get(deployment.applicationId) ??
                      deployment.applicationId}
                  </TableCell>
                  <TableCell className='font-mono text-xs'>
                    {deployment.previousReleaseId
                      ? (releaseVersions.get(deployment.previousReleaseId) ??
                        deployment.previousReleaseId)
                      : '—'}
                  </TableCell>
                  <TableCell className='font-mono text-xs'>
                    {releaseVersions.get(deployment.targetReleaseId) ??
                      deployment.targetReleaseId}
                  </TableCell>
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
                  <TableCell>
                    {memberNames.get(deployment.requestedBy) ??
                      deployment.requestedBy}
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

      <div className='grid gap-3 md:hidden'>
        {deployments.map((deployment) => (
          <Card key={deployment.id} size='sm' className='bg-card'>
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
                    {translate('hub.common.type', 'Type')}
                  </dt>
                  <dd className='mt-1 font-medium'>
                    {getDeploymentTypeLabel(deployment.type, translate)}
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
                <div>
                  <dt className='text-muted-foreground'>
                    {translate(
                      'hub.deployments.columns.fromRelease',
                      'From release',
                    )}
                  </dt>
                  <dd className='mt-1 font-mono'>
                    {deployment.previousReleaseId
                      ? (releaseVersions.get(deployment.previousReleaseId) ??
                        deployment.previousReleaseId)
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {translate(
                      'hub.deployments.columns.toRelease',
                      'To release',
                    )}
                  </dt>
                  <dd className='mt-1 font-mono'>
                    {releaseVersions.get(deployment.targetReleaseId) ??
                      deployment.targetReleaseId}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {translate(
                      'hub.deployments.columns.requestedBy',
                      'Requested by',
                    )}
                  </dt>
                  <dd className='mt-1 font-medium'>
                    {memberNames.get(deployment.requestedBy) ??
                      deployment.requestedBy}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {translate('hub.deployments.columns.duration', 'Duration')}
                  </dt>
                  <dd className='mt-1 font-medium'>
                    {formatHubDuration(
                      deployment.startedAt,
                      deployment.finishedAt,
                      translate,
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

function useDeploymentReferences(
  deployments: HubDeployment[],
  capabilities: HubCapabilities | undefined,
  fetcher?: HubFetcher,
): {
  releaseVersions: Map<string, string>;
  memberNames: Map<string, string>;
} {
  const [releaseVersions, setReleaseVersions] = useState<Map<string, string>>(
    new Map(),
  );
  const [memberNames, setMemberNames] = useState<Map<string, string>>(
    new Map(),
  );
  const releaseReferences = useMemo(() => {
    const references = new Map<string, { applicationId: string; id: string }>();
    for (const deployment of deployments) {
      for (const id of [
        deployment.previousReleaseId,
        deployment.targetReleaseId,
      ]) {
        if (
          id &&
          hasHubCapability(
            capabilities,
            'hub.release',
            'read',
            deployment.applicationId,
          )
        ) {
          references.set(id, { applicationId: deployment.applicationId, id });
        }
      }
    }
    return [...references.values()];
  }, [capabilities, deployments]);
  const memberIds = useMemo(
    () =>
      hasHubCapability(capabilities, 'hub.member', 'read')
        ? [...new Set(deployments.map((item) => item.requestedBy))]
        : [],
    [capabilities, deployments],
  );
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      releaseReferences.map(async ({ applicationId, id }) => {
        try {
          const result = await hubGet<HubRelease>(
            `/apps/${encodeURIComponent(applicationId)}/releases/${encodeURIComponent(id)}`,
            fetcher,
          );
          return [id, result.data.version] as const;
        } catch {
          return null;
        }
      }),
    ).then((values) => {
      if (!cancelled)
        setReleaseVersions(
          new Map(values.filter(Boolean) as [string, string][]),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher, releaseReferences]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      memberIds.map(async (id) => {
        try {
          const result = await hubGet<HubMember>(
            `/members/${encodeURIComponent(id)}`,
            fetcher,
          );
          return [id, result.data.name] as const;
        } catch {
          return null;
        }
      }),
    ).then((values) => {
      if (!cancelled)
        setMemberNames(new Map(values.filter(Boolean) as [string, string][]));
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher, memberIds]);

  return { releaseVersions, memberNames };
}

export default DeploymentsPage;

import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
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
  APPLICATION_OPTIONS,
  cloneDeploymentFixtures,
  deploymentCsv,
  downloadCsv,
  filterDeployments,
  formatDateTime,
  formatDuration,
  type DeploymentFilters,
  type DeploymentRecord,
  type DeploymentStatus,
  type DeploymentType,
} from '../domain/operations.js';

const INITIAL_FILTERS: DeploymentFilters = {
  search: '',
  applicationId: 'all',
  status: 'all',
  type: 'all',
  requestedBy: '',
  from: '',
  to: '',
  sort: '-createdAt',
};

export default function DeploymentsPage(): ReactElement {
  const { t } = useTranslation();
  const [deployments] = useState<DeploymentRecord[]>(cloneDeploymentFixtures);
  const [filters, setFilters] = useState<DeploymentFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const filtered = useMemo(
    () => filterDeployments(deployments, filters),
    [deployments, filters],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const updateFilter = <TKey extends keyof DeploymentFilters>(
    key: TKey,
    value: DeploymentFilters[TKey],
  ): void => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <header className='border-b bg-background px-4 py-7 sm:px-6'>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between'>
          <div className='max-w-3xl'>
            <p className='inline-flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase'>
              <Activity className='size-3.5' aria-hidden='true' />
              {t('deployments.eyebrow', { defaultValue: 'Operations' })}
            </p>
            <h1 className='mt-1 text-2xl font-semibold tracking-tight'>
              {t('deployments.title', { defaultValue: 'Deployments' })}
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('deployments.description', {
                defaultValue:
                  'Follow deployments and rollbacks across every application, then inspect each execution timeline.',
              })}
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              downloadCsv('hub-deployments.csv', deploymentCsv(filtered))
            }
          >
            <Download aria-hidden='true' />
            {t('common.exportCsv', { defaultValue: 'Export CSV' })}
          </Button>
        </div>
      </header>

      <div className='mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6'>
        <Card>
          <CardContent className='space-y-4'>
            <div className='grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_repeat(4,minmax(9rem,auto))]'>
              <label className='relative block'>
                <span className='sr-only'>
                  {t('deployments.filters.search', {
                    defaultValue: 'Search deployments',
                  })}
                </span>
                <Search
                  className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
                  aria-hidden='true'
                />
                <Input
                  className='pl-8'
                  value={filters.search}
                  onChange={(event) =>
                    updateFilter('search', event.target.value)
                  }
                  placeholder={t('deployments.filters.searchPlaceholder', {
                    defaultValue: 'Deployment, release, or application',
                  })}
                />
              </label>
              <FilterSelect
                label={t('deployments.filters.application', {
                  defaultValue: 'Application',
                })}
                value={filters.applicationId}
                onChange={(value) => updateFilter('applicationId', value)}
              >
                <NativeSelectOption value='all'>
                  {t('deployments.filters.allApplications', {
                    defaultValue: 'All applications',
                  })}
                </NativeSelectOption>
                {APPLICATION_OPTIONS.map((application) => (
                  <NativeSelectOption
                    key={application.id}
                    value={application.id}
                  >
                    {application.name}
                  </NativeSelectOption>
                ))}
              </FilterSelect>
              <FilterSelect
                label={t('deployments.filters.status', {
                  defaultValue: 'Status',
                })}
                value={filters.status}
                onChange={(value) => updateFilter('status', value)}
              >
                <NativeSelectOption value='all'>
                  {t('deployments.filters.allStatuses', {
                    defaultValue: 'All statuses',
                  })}
                </NativeSelectOption>
                {[
                  'queued',
                  'preparing',
                  'activating',
                  'checking',
                  'switching',
                  'draining',
                  'succeeded',
                  'failed',
                  'cancelled',
                ].map((status) => (
                  <NativeSelectOption key={status} value={status}>
                    {statusLabel(status as DeploymentStatus, t)}
                  </NativeSelectOption>
                ))}
              </FilterSelect>
              <FilterSelect
                label={t('deployments.filters.type', { defaultValue: 'Type' })}
                value={filters.type}
                onChange={(value) => updateFilter('type', value)}
              >
                <NativeSelectOption value='all'>
                  {t('deployments.filters.allTypes', {
                    defaultValue: 'All types',
                  })}
                </NativeSelectOption>
                {(['deploy', 'rollback', 'redeploy'] as const).map((type) => (
                  <NativeSelectOption key={type} value={type}>
                    {typeLabel(type, t)}
                  </NativeSelectOption>
                ))}
              </FilterSelect>
              <FilterSelect
                label={t('deployments.filters.sort', {
                  defaultValue: 'Sort deployments',
                })}
                value={filters.sort}
                onChange={(value) =>
                  updateFilter('sort', value as DeploymentFilters['sort'])
                }
              >
                <NativeSelectOption value='-createdAt'>
                  {t('deployments.sort.createdNewest', {
                    defaultValue: 'Created: newest first',
                  })}
                </NativeSelectOption>
                <NativeSelectOption value='createdAt'>
                  {t('deployments.sort.createdOldest', {
                    defaultValue: 'Created: oldest first',
                  })}
                </NativeSelectOption>
                <NativeSelectOption value='-startedAt'>
                  {t('deployments.sort.startedNewest', {
                    defaultValue: 'Started: newest first',
                  })}
                </NativeSelectOption>
                <NativeSelectOption value='startedAt'>
                  {t('deployments.sort.startedOldest', {
                    defaultValue: 'Started: oldest first',
                  })}
                </NativeSelectOption>
                <NativeSelectOption value='-finishedAt'>
                  {t('deployments.sort.finishedNewest', {
                    defaultValue: 'Finished: newest first',
                  })}
                </NativeSelectOption>
                <NativeSelectOption value='finishedAt'>
                  {t('deployments.sort.finishedOldest', {
                    defaultValue: 'Finished: oldest first',
                  })}
                </NativeSelectOption>
              </FilterSelect>
            </div>
            <div className='grid gap-3 border-t pt-4 sm:grid-cols-2'>
              <DateFilter
                id='deployment-from'
                label={t('deployments.filters.from', { defaultValue: 'From' })}
                value={filters.from}
                onChange={(value) => updateFilter('from', value)}
              />
              <DateFilter
                id='deployment-to'
                label={t('deployments.filters.to', { defaultValue: 'To' })}
                value={filters.to}
                onChange={(value) => updateFilter('to', value)}
              />
            </div>
            <div className='flex justify-end border-t pt-4'>
              <Button
                type='button'
                variant='ghost'
                onClick={() => {
                  setFilters(INITIAL_FILTERS);
                  setPage(1);
                }}
              >
                {t('deployments.filters.clear', {
                  defaultValue: 'Clear filters',
                })}
              </Button>
            </div>
          </CardContent>
        </Card>

        {visible.length === 0 ? (
          <Card>
            <CardContent className='py-14 text-center'>
              <Activity className='mx-auto mb-3 size-8 text-muted-foreground' />
              <p className='font-medium'>
                {t('deployments.empty.title', {
                  defaultValue: 'No matching deployments',
                })}
              </p>
              <p className='mt-1 text-sm text-muted-foreground'>
                {t('deployments.empty.description', {
                  defaultValue: 'Change the filters to see other operations.',
                })}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className='py-0'>
            <CardContent className='px-0'>
              <DeploymentTable deployments={visible} />
            </CardContent>
          </Card>
        )}

        <Pagination
          page={safePage}
          pageCount={pageCount}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    </main>
  );
}

function DeploymentTable({
  deployments,
}: {
  readonly deployments: readonly DeploymentRecord[];
}): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <Table className='max-md:block'>
      <TableHeader className='max-md:hidden'>
        <TableRow>
          <TableHead>
            {t('deployments.columns.deployment', {
              defaultValue: 'Deployment',
            })}
          </TableHead>
          <TableHead>
            {t('deployments.columns.application', {
              defaultValue: 'Application',
            })}
          </TableHead>
          <TableHead>
            {t('deployments.columns.release', { defaultValue: 'Release' })}
          </TableHead>
          <TableHead>
            {t('deployments.columns.type', { defaultValue: 'Type' })}
          </TableHead>
          <TableHead>
            {t('deployments.columns.status', { defaultValue: 'Status' })}
          </TableHead>
          <TableHead>
            {t('deployments.columns.started', { defaultValue: 'Started' })}
          </TableHead>
          <TableHead>
            {t('deployments.columns.requestedBy', {
              defaultValue: 'Requested by',
            })}
          </TableHead>
          <TableHead>
            {t('deployments.columns.duration', { defaultValue: 'Duration' })}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='max-md:grid max-md:gap-3 max-md:p-3'>
        {deployments.map((deployment) => (
          <TableRow
            key={deployment.id}
            className='max-md:grid max-md:grid-cols-2 max-md:gap-3 max-md:rounded-lg max-md:border max-md:bg-card max-md:p-4'
          >
            <TableCell className='max-md:col-span-2 max-md:p-0'>
              <Link
                to={`/deployments/${encodeURIComponent(deployment.id)}`}
                className='font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline'
              >
                {deployment.displayId}
              </Link>
            </TableCell>
            <ResponsiveCell
              label={t('deployments.columns.application', {
                defaultValue: 'Application',
              })}
            >
              <span className='font-medium'>{deployment.applicationName}</span>
            </ResponsiveCell>
            <ResponsiveCell
              label={t('deployments.columns.release', {
                defaultValue: 'Release',
              })}
            >
              <span className='font-mono text-xs'>
                {deployment.previousRelease ?? '—'} → {deployment.targetRelease}
              </span>
            </ResponsiveCell>
            <ResponsiveCell
              label={t('deployments.columns.type', { defaultValue: 'Type' })}
            >
              {typeLabel(deployment.type, t)}
            </ResponsiveCell>
            <ResponsiveCell
              label={t('deployments.columns.status', {
                defaultValue: 'Status',
              })}
            >
              <StatusBadge status={deployment.status} />
            </ResponsiveCell>
            <ResponsiveCell
              label={t('deployments.columns.started', {
                defaultValue: 'Started',
              })}
            >
              {formatDateTime(
                deployment.startedAt ?? deployment.createdAt,
                locale,
              )}
            </ResponsiveCell>
            <ResponsiveCell
              label={t('deployments.columns.requestedBy', {
                defaultValue: 'Requested by',
              })}
            >
              {deployment.requestedBy}
            </ResponsiveCell>
            <ResponsiveCell
              label={t('deployments.columns.duration', {
                defaultValue: 'Duration',
              })}
            >
              {formatDuration(deployment.startedAt, deployment.finishedAt)}
            </ResponsiveCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ResponsiveCell({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <TableCell className='max-md:p-0 max-md:whitespace-normal'>
      <span className='mb-1 block text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase md:hidden'>
        {label}
      </span>
      {children}
    </TableCell>
  );
}

export function StatusBadge({
  status,
}: {
  readonly status: DeploymentStatus;
}): ReactElement {
  const { t } = useTranslation();
  const variant =
    status === 'failed' || status === 'cancelled'
      ? 'destructive'
      : status === 'succeeded'
        ? 'default'
        : 'secondary';
  return <Badge variant={variant}>{statusLabel(status, t)}</Badge>;
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <NativeSelect
      className='w-full'
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </NativeSelect>
  );
}

function DateFilter(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactElement {
  return (
    <label htmlFor={props.id} className='space-y-1.5 text-xs font-medium'>
      <span className='inline-flex items-center gap-1.5'>
        <CalendarDays
          className='size-3.5 text-muted-foreground'
          aria-hidden='true'
        />
        {props.label}
      </span>
      <Input
        id={props.id}
        type='date'
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  readonly page: number;
  readonly pageCount: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between'>
      <p className='text-muted-foreground'>
        {translateValues(
          t,
          'pagination.summary',
          '{{total}} results · Page {{page}} of {{pageCount}}',
          {
            total: String(total),
            page: String(page),
            pageCount: String(pageCount),
          },
        )}
      </p>
      <div className='flex items-center gap-2'>
        <NativeSelect
          aria-label={t('pagination.pageSize', {
            defaultValue: 'Rows per page',
          })}
          value={String(pageSize)}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {[5, 10, 20].map((size) => (
            <NativeSelectOption key={size} value={String(size)}>
              {translateValues(t, 'pagination.rows', '{{count}} rows', {
                count: String(size),
              })}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          type='button'
          variant='outline'
          size='icon-sm'
          aria-label={t('pagination.previous', {
            defaultValue: 'Previous page',
          })}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          type='button'
          variant='outline'
          size='icon-sm'
          aria-label={t('pagination.next', { defaultValue: 'Next page' })}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

type Translate = ReturnType<typeof useTranslation>['t'];

function statusLabel(status: DeploymentStatus, t: Translate): string {
  const labels: Record<DeploymentStatus, string> = {
    queued: t('status.queued', { defaultValue: 'Queued' }),
    preparing: t('status.preparing', { defaultValue: 'Preparing' }),
    activating: t('status.activating', { defaultValue: 'Activating' }),
    checking: t('status.checking', { defaultValue: 'Checking' }),
    switching: t('status.switching', { defaultValue: 'Switching' }),
    draining: t('status.draining', { defaultValue: 'Draining' }),
    succeeded: t('status.succeeded', { defaultValue: 'Succeeded' }),
    failed: t('status.failed', { defaultValue: 'Failed' }),
    cancelled: t('status.cancelled', { defaultValue: 'Cancelled' }),
  };
  return labels[status];
}

function typeLabel(type: DeploymentType, t: Translate): string {
  const labels: Record<DeploymentType, string> = {
    deploy: t('deploymentType.deploy', { defaultValue: 'Deploy' }),
    rollback: t('deploymentType.rollback', { defaultValue: 'Rollback' }),
    redeploy: t('deploymentType.redeploy', { defaultValue: 'Redeploy' }),
  };
  return labels[type];
}

function translateValues(
  t: Translate,
  key: string,
  defaultValue: string,
  values: Readonly<Record<string, string>>,
): string {
  const translated = t(key, { defaultValue, ...values });
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{{${name}}}`, value),
    translated,
  );
}

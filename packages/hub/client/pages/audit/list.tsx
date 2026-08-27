import { Download, Eye, ScrollText } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslate } from '@refinedev/core';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  buildHubApiUrl,
  hasHubCapability,
  type HubApplication,
  type HubAuditLog,
  type HubFetcher,
  type HubMe,
  useHubQuery,
} from '@/features/hub/api';
import {
  formatHubDate,
  HubEmptyState,
  HubErrorState,
  HubListSkeleton,
  HubStatusBadge,
} from '@/features/hub/components';
import {
  HubPageHeader,
  HubSearchInput,
  HubTablePagination,
} from '@/features/hub/management-components';
import { useHubPageQuery } from '@/features/hub/pagination';
import { useOptionalHubRuntime } from '@/features/hub/provider';
import {
  getHubAuditActionLabel,
  getHubAuditResourceLabel,
  getHubAuditSourceLabel,
} from '@/features/hub/labels';
import { getStatusLabel } from '@/features/hub/status';

export interface AuditLogPageProps {
  fetcher?: HubFetcher;
}

export function AuditLogPage({ fetcher }: AuditLogPageProps) {
  const translate = useTranslate();
  const runtime = useOptionalHubRuntime();
  const me = useHubQuery<HubMe>({
    path: runtime ? null : '/me',
    fetcher,
    enabled: !runtime,
  });
  const capabilities = runtime?.me.capabilities ?? me.data?.capabilities;
  const canExport = hasHubCapability(capabilities, 'hub.auditLog', 'export');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [applicationId, setApplicationId] = useState('all');
  const [action, setAction] = useState('all');
  const [result, setResult] = useState('all');
  const [source, setSource] = useState('all');
  const [actorId, setActorId] = useState('');
  const [resource, setResource] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const applications = useHubQuery<HubApplication[]>({
    path: '/apps?limit=100&offset=0&sort=name',
    fetcher,
    initialData: [],
  });
  const filterPath = useMemo(
    () =>
      createAuditPath('/audit-logs', {
        query: deferredSearch,
        applicationId,
        action,
        result,
        source,
        actorId,
        resource,
        resourceId,
        from: toIsoDateTime(from),
        to: toIsoDateTime(to),
      }),
    [
      action,
      actorId,
      applicationId,
      deferredSearch,
      from,
      resource,
      resourceId,
      result,
      source,
      to,
    ],
  );
  const logs = useHubPageQuery<HubAuditLog>({ path: filterPath, fetcher });
  const selectedLog = useHubQuery<HubAuditLog>({
    path: selectedLogId
      ? `/audit-logs/${encodeURIComponent(selectedLogId)}`
      : null,
    fetcher,
    enabled: Boolean(selectedLogId),
  });
  const exportUrl = buildHubApiUrl(
    createAuditPath('/audit-logs.csv', {
      query: deferredSearch,
      applicationId,
      action,
      result,
      source,
      actorId,
      resource,
      resourceId,
      from: toIsoDateTime(from),
      to: toIsoDateTime(to),
    }),
  );

  return (
    <div className='space-y-6'>
      <HubPageHeader
        eyebrow={
          <>
            <ScrollText aria-hidden='true' />
            {translate('hub.audit.eyebrow', 'Governance')}
          </>
        }
        title={translate('hub.audit.title', 'Audit log')}
        description={translate(
          'hub.audit.description',
          'See who performed each Hub management action, when it happened, which application or resource it affected, and the final result.',
        )}
        actions={
          canExport ? (
            <Button
              variant='outline'
              nativeButton={false}
              render={<a href={exportUrl} download />}
            >
              <Download aria-hidden='true' />
              {translate('hub.audit.export', 'Export audit CSV')}
            </Button>
          ) : undefined
        }
      />

      <div className='flex flex-col gap-3 xl:flex-row xl:items-center'>
        <HubSearchInput
          value={search}
          onChange={setSearch}
          label={translate('hub.audit.search.label', 'Search audit log')}
          placeholder={translate(
            'hub.audit.search.placeholder',
            'Search actor, application, action, or resource',
          )}
        />
        <div className='flex flex-wrap gap-2'>
          <FilterSelect
            label={translate(
              'hub.audit.filter.application',
              'Filter by application',
            )}
            value={applicationId}
            onChange={setApplicationId}
          >
            <NativeSelectOption value='all'>
              {translate(
                'hub.audit.filter.allApplications',
                'All applications',
              )}
            </NativeSelectOption>
            {(applications.data ?? []).map((application) => (
              <NativeSelectOption key={application.id} value={application.id}>
                {application.name}
              </NativeSelectOption>
            ))}
          </FilterSelect>
          <FilterSelect
            label={translate('hub.audit.filter.action', 'Filter by action')}
            value={action}
            onChange={setAction}
          >
            <NativeSelectOption value='all'>
              {translate('hub.audit.filter.allActions', 'All actions')}
            </NativeSelectOption>
            {AUDIT_ACTIONS.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {getHubAuditActionLabel(value, translate)}
              </NativeSelectOption>
            ))}
          </FilterSelect>
          <FilterSelect
            label={translate('hub.audit.filter.result', 'Filter by result')}
            value={result}
            onChange={setResult}
          >
            <NativeSelectOption value='all'>
              {translate('hub.audit.filter.allResults', 'All results')}
            </NativeSelectOption>
            {['success', 'failure', 'denied'].map((value) => (
              <NativeSelectOption key={value} value={value}>
                {getStatusLabel(value, translate)}
              </NativeSelectOption>
            ))}
          </FilterSelect>
          <FilterSelect
            label={translate('hub.audit.filter.source', 'Filter by source')}
            value={source}
            onChange={setSource}
          >
            <NativeSelectOption value='all'>
              {translate('hub.audit.filter.allSources', 'All sources')}
            </NativeSelectOption>
            {['web', 'agent', 'system'].map((value) => (
              <NativeSelectOption key={value} value={value}>
                {getHubAuditSourceLabel(value, translate)}
              </NativeSelectOption>
            ))}
          </FilterSelect>
        </div>
      </div>

      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
        <AuditTextFilter
          id='hub-audit-actor-id'
          label={translate('hub.audit.filter.actorId', 'Actor ID')}
          value={actorId}
          onChange={setActorId}
        />
        <AuditTextFilter
          id='hub-audit-resource'
          label={translate('hub.audit.filter.resource', 'Resource type')}
          value={resource}
          onChange={setResource}
        />
        <AuditTextFilter
          id='hub-audit-resource-id'
          label={translate('hub.audit.filter.resourceId', 'Resource ID')}
          value={resourceId}
          onChange={setResourceId}
        />
        <AuditDateFilter
          id='hub-audit-from'
          label={translate('hub.audit.filter.from', 'From')}
          value={from}
          onChange={setFrom}
        />
        <AuditDateFilter
          id='hub-audit-to'
          label={translate('hub.audit.filter.to', 'To')}
          value={to}
          onChange={setTo}
        />
      </div>

      {logs.error ? (
        <HubErrorState error={logs.error} onRetry={logs.reload} />
      ) : logs.loading ? (
        <HubListSkeleton rows={8} />
      ) : logs.data.length === 0 ? (
        <HubEmptyState
          title={translate('hub.audit.empty.title', 'No audit events')}
          description={translate(
            'hub.audit.empty.description',
            'No management activity matches the current filters.',
          )}
        />
      ) : (
        <Card className='overflow-hidden py-0'>
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
                    {translate('hub.common.application', 'Application')}
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
                  <TableHead className='pr-4 text-right'>
                    {translate('hub.common.actions', 'Actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.data.map((log) => (
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
                    <TableCell>
                      {log.application?.name ??
                        translate('hub.audit.hubScope', 'Hub')}
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
                    <TableCell className='pr-4 text-right'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        aria-label={`${translate(
                          'hub.audit.details.view',
                          'View details',
                        )}: ${getHubAuditActionLabel(log.action, translate)}`}
                        onClick={() => setSelectedLogId(log.id)}
                      >
                        <Eye aria-hidden='true' />
                        {translate('hub.audit.details.view', 'View details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <HubTablePagination
            page={logs.page}
            pageCount={logs.pageCount}
            pageSize={logs.pageSize}
            total={logs.total}
            onPageChange={logs.setPage}
            onPageSizeChange={logs.setPageSize}
          />
        </Card>
      )}

      <AuditLogDetailDialog
        open={Boolean(selectedLogId)}
        onOpenChange={(open) => {
          if (!open) setSelectedLogId(null);
        }}
        log={selectedLog.data?.id === selectedLogId ? selectedLog.data : null}
        loading={selectedLog.loading || selectedLog.data?.id !== selectedLogId}
        error={selectedLog.error}
        onRetry={selectedLog.reload}
      />
    </div>
  );
}

function AuditTextFilter({
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

function AuditDateFilter({
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

function AuditLogDetailDialog({
  open,
  onOpenChange,
  log,
  loading,
  error,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: HubAuditLog | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const translate = useTranslate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[min(48rem,calc(100vh-2rem))] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {translate('hub.audit.details.title', 'Audit event details')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'hub.audit.details.description',
              'Identity, request context, affected resource, and the safe event payload recorded by Hub.',
            )}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <HubErrorState error={error} onRetry={onRetry} />
        ) : loading || !log ? (
          <HubListSkeleton rows={5} />
        ) : (
          <AuditLogDetails log={log} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AuditLogDetails({ log }: { log: HubAuditLog }) {
  const translate = useTranslate();
  const client: AuditClientDetail | null = log.client ?? null;
  return (
    <div className='space-y-5'>
      <dl className='grid gap-4 sm:grid-cols-2'>
        <AuditDetailItem
          label={translate('hub.audit.details.time', 'Time')}
          value={formatHubDate(log.createdAt)}
        />
        <AuditDetailItem
          label={translate('hub.audit.details.requestId', 'Request ID')}
          value={log.requestId ?? '—'}
          code
        />
        <AuditDetailItem
          label={translate('hub.audit.details.actor', 'Actor')}
          value={
            log.actor?.name ?? translate('hub.audit.systemActor', 'System')
          }
          secondary={
            [
              log.actor?.email,
              log.actor?.type
                ? translate(
                    `hub.audit.actorType.${log.actor.type}`,
                    log.actor.type,
                  )
                : translate('hub.audit.actorType.system', 'System'),
              log.actor?.id,
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        />
        <AuditDetailItem
          label={translate('hub.common.application', 'Application')}
          value={
            log.application?.name ?? translate('hub.audit.hubScope', 'Hub')
          }
          secondary={
            log.application
              ? `${log.application.slug} · ${log.application.id}`
              : undefined
          }
        />
        <AuditDetailItem
          label={translate('hub.common.action', 'Action')}
          value={getHubAuditActionLabel(log.action, translate)}
          code
        />
        <AuditDetailItem
          label={translate('hub.audit.columns.resource', 'Resource')}
          value={getHubAuditResourceLabel(log.resource, translate)}
          secondary={log.resourceId ?? '—'}
          code
        />
        <div className='space-y-1'>
          <dt className='text-xs font-medium text-muted-foreground'>
            {translate('hub.audit.columns.result', 'Result')}
          </dt>
          <dd>
            <HubStatusBadge status={log.result} />
          </dd>
        </div>
        <AuditDetailItem
          label={translate('hub.common.source', 'Source')}
          value={getHubAuditSourceLabel(log.source, translate)}
        />
      </dl>

      <section className='space-y-2'>
        <h3 className='text-sm font-medium'>
          {translate('hub.audit.details.client', 'Client')}
        </h3>
        <dl className='grid gap-3 rounded-lg border bg-muted/25 p-3 sm:grid-cols-3'>
          <AuditDetailItem
            label={translate('hub.audit.details.clientName', 'Name')}
            value={client?.name ?? '—'}
          />
          <AuditDetailItem
            label={translate('hub.audit.details.credentialId', 'Credential ID')}
            value={client?.credentialId ?? '—'}
            code
          />
          <AuditDetailItem
            label={translate('hub.audit.details.ipAddress', 'IP address')}
            value={client?.ip ?? '—'}
            code
          />
        </dl>
      </section>

      <section className='space-y-2'>
        <h3 className='text-sm font-medium'>
          {translate('hub.audit.details.payload', 'Details (safe JSON)')}
        </h3>
        <pre className='max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all'>
          {safeJson(log.details)}
        </pre>
      </section>
    </div>
  );
}

interface AuditClientDetail {
  credentialId?: string | null;
  name?: string | null;
  ip?: string | null;
}

function AuditDetailItem({
  label,
  value,
  secondary,
  code = false,
}: {
  label: string;
  value: string;
  secondary?: string;
  code?: boolean;
}) {
  return (
    <div className='min-w-0 space-y-1'>
      <dt className='text-xs font-medium text-muted-foreground'>{label}</dt>
      <dd className={code ? 'break-all font-mono text-xs' : 'break-words'}>
        {value}
      </dd>
      {secondary ? (
        <dd className='break-all text-xs text-muted-foreground'>{secondary}</dd>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </NativeSelect>
  );
}

function createAuditPath(
  base: string,
  filters: Record<string, string>,
): string {
  const params = new URLSearchParams({ sort: '-createdAt' });
  for (const [key, rawValue] of Object.entries(filters)) {
    const value = rawValue.trim();
    if (value && value !== 'all') params.set(key, value);
  }
  return `${base}?${params.toString()}`;
}

function toIsoDateTime(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toISOString();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

const AUDIT_ACTIONS = [
  'application.created',
  'application.updated',
  'application.archived',
  'application.restored',
  'release.published',
  'release.pinned',
  'release.unpinned',
  'deployment.requested',
  'deployment.succeeded',
  'deployment.failed',
  'runtime.started',
  'runtime.evicted',
  'runtime.restarted',
  'runtimeSecret.rotated',
  'runtimeSecret.rotationFailed',
  'credential.authorized',
  'credential.revoked',
  'member.invited',
  'member.updated',
  'permission.updated',
  'settings.updated',
  'defaultApplication.bootstrapped',
  'defaultApplication.bootstrapFailed',
  'setup.owner.created',
];

export default AuditLogPage;

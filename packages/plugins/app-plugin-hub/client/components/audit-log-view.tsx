import { useId, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Search,
  ShieldCheck,
} from 'lucide-react';

import {
  auditCsv,
  downloadCsv,
  filterAuditRecords,
  formatDateTime,
  safeJson,
  type ApplicationOption,
  type AuditFilters,
  type AuditRecord,
  type AuditResult,
  type AuditSource,
} from '../domain/operations.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Card, CardContent } from './ui/card.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Input } from './ui/input.js';
import { NativeSelect, NativeSelectOption } from './ui/native-select.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table.js';

const INITIAL_FILTERS: AuditFilters = {
  search: '',
  applicationId: 'all',
  action: 'all',
  result: 'all',
  source: 'all',
  actor: '',
  resource: '',
  resourceId: '',
  from: '',
  to: '',
};

interface AuditLogViewProps {
  readonly records: readonly AuditRecord[];
  readonly actions: readonly string[];
  readonly applicationOptions: readonly ApplicationOption[];
  readonly showFilters: boolean;
  readonly showApplication: boolean;
  readonly exportFileName: string;
  readonly title: string;
  readonly description: string;
  readonly eyebrow?: string;
  readonly variant: 'page' | 'embedded';
}

export function AuditLogView({
  records,
  actions,
  applicationOptions,
  showFilters,
  showApplication,
  exportFileName,
  title,
  description,
  eyebrow,
  variant,
}: AuditLogViewProps): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const auditId = useId();
  const [filters, setFilters] = useState<AuditFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selected, setSelected] = useState<AuditRecord | null>(null);
  const filtered = useMemo(
    () => filterAuditRecords(records, filters),
    [filters, records],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const updateFilter = <TKey extends keyof AuditFilters>(
    key: TKey,
    value: AuditFilters[TKey],
  ): void => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const header = (
    <header
      className={
        variant === 'page'
          ? 'border-b bg-background px-4 py-7 sm:px-6'
          : 'flex flex-wrap items-end justify-between gap-3'
      }
    >
      <div
        className={
          variant === 'page'
            ? 'mx-auto flex w-full max-w-7xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between'
            : 'contents'
        }
      >
        <div className={variant === 'page' ? 'max-w-3xl' : undefined}>
          {eyebrow ? (
            <p className='inline-flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase'>
              <ShieldCheck className='size-3.5' aria-hidden='true' />
              {eyebrow}
            </p>
          ) : null}
          {variant === 'page' ? (
            <h1 className='mt-1 text-2xl font-semibold tracking-tight'>
              {title}
            </h1>
          ) : (
            <h2 className='text-lg font-semibold'>{title}</h2>
          )}
          <p
            className={
              variant === 'page'
                ? 'mt-1 text-sm text-muted-foreground'
                : 'text-sm text-muted-foreground'
            }
          >
            {description}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          onClick={() => downloadCsv(exportFileName, auditCsv(filtered))}
        >
          <Download aria-hidden='true' />
          {t('common.exportCsv', { defaultValue: 'Export CSV' })}
        </Button>
      </div>
    </header>
  );

  const content = (
    <div
      className={
        variant === 'page'
          ? 'mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6'
          : 'space-y-5'
      }
    >
      {showFilters ? (
        <Card>
          <CardContent className='space-y-4'>
            <div className='grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_repeat(4,minmax(9rem,auto))]'>
              <label className='relative block'>
                <span className='sr-only'>
                  {t('audit.filters.search', {
                    defaultValue: 'Search audit log',
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
                  placeholder={t('audit.filters.searchPlaceholder', {
                    defaultValue: 'Actor, action, object, or request',
                  })}
                />
              </label>
              {showApplication ? (
                <FilterSelect
                  label={t('audit.filters.application', {
                    defaultValue: 'Application',
                  })}
                  value={filters.applicationId}
                  onChange={(value) => updateFilter('applicationId', value)}
                >
                  <NativeSelectOption value='all'>
                    {t('audit.filters.allApplications', {
                      defaultValue: 'All applications',
                    })}
                  </NativeSelectOption>
                  {applicationOptions.map((application) => (
                    <NativeSelectOption
                      key={application.id}
                      value={application.id}
                    >
                      {application.name}
                    </NativeSelectOption>
                  ))}
                </FilterSelect>
              ) : null}
              <FilterSelect
                label={t('audit.filters.action', { defaultValue: 'Action' })}
                value={filters.action}
                onChange={(value) => updateFilter('action', value)}
              >
                <NativeSelectOption value='all'>
                  {t('audit.filters.allActions', {
                    defaultValue: 'All actions',
                  })}
                </NativeSelectOption>
                {actions.map((action) => (
                  <NativeSelectOption key={action} value={action}>
                    {actionFilterLabel(action, t)}
                  </NativeSelectOption>
                ))}
              </FilterSelect>
              <FilterSelect
                label={t('audit.filters.result', { defaultValue: 'Result' })}
                value={filters.result}
                onChange={(value) => updateFilter('result', value)}
              >
                <NativeSelectOption value='all'>
                  {t('audit.filters.allResults', {
                    defaultValue: 'All results',
                  })}
                </NativeSelectOption>
                {(['success', 'failure', 'denied'] as const).map((result) => (
                  <NativeSelectOption key={result} value={result}>
                    {resultLabel(result, t)}
                  </NativeSelectOption>
                ))}
              </FilterSelect>
              <FilterSelect
                label={t('audit.filters.source', { defaultValue: 'Source' })}
                value={filters.source}
                onChange={(value) => updateFilter('source', value)}
              >
                <NativeSelectOption value='all'>
                  {t('audit.filters.allSources', {
                    defaultValue: 'All sources',
                  })}
                </NativeSelectOption>
                {(['web', 'agent', 'system'] as const).map((source) => (
                  <NativeSelectOption key={source} value={source}>
                    {sourceLabel(source, t)}
                  </NativeSelectOption>
                ))}
              </FilterSelect>
            </div>
            <div className='grid gap-3 border-t pt-4 sm:grid-cols-2'>
              <DateFilter
                id={`${auditId}-from`}
                label={t('audit.filters.from', { defaultValue: 'From' })}
                value={filters.from}
                onChange={(value) => updateFilter('from', value)}
              />
              <DateFilter
                id={`${auditId}-to`}
                label={t('audit.filters.to', { defaultValue: 'To' })}
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
                {t('audit.filters.clear', { defaultValue: 'Clear filters' })}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {visible.length === 0 ? (
        <Card>
          <CardContent className='py-14 text-center'>
            <ShieldCheck className='mx-auto mb-3 size-8 text-muted-foreground' />
            <p className='font-medium'>
              {t('audit.empty.title', { defaultValue: 'No audit events' })}
            </p>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('audit.empty.description', {
                defaultValue: 'No management activity matches these filters.',
              })}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className='py-0'>
          <CardContent className='px-0'>
            <Table
              className={showApplication ? 'min-w-[920px]' : 'min-w-[780px]'}
            >
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t('audit.columns.time', { defaultValue: 'Time' })}
                  </TableHead>
                  <TableHead>
                    {t('audit.columns.actor', { defaultValue: 'Actor' })}
                  </TableHead>
                  {showApplication ? (
                    <TableHead>
                      {t('audit.columns.application', {
                        defaultValue: 'Application',
                      })}
                    </TableHead>
                  ) : null}
                  <TableHead>
                    {t('audit.columns.action', { defaultValue: 'Action' })}
                  </TableHead>
                  <TableHead>
                    {t('audit.columns.resource', {
                      defaultValue: 'Target object',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('audit.columns.result', { defaultValue: 'Result' })}
                  </TableHead>
                  <TableHead>
                    {t('audit.columns.source', { defaultValue: 'Source' })}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('audit.columns.actions', { defaultValue: 'Actions' })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      {formatDateTime(record.createdAt, locale)}
                    </TableCell>
                    <TableCell>
                      <p className='font-medium'>{record.actorName}</p>
                      <p className='text-xs text-muted-foreground'>
                        {record.actorEmail ?? record.actorId}
                      </p>
                    </TableCell>
                    {showApplication ? (
                      <TableCell>{record.applicationName}</TableCell>
                    ) : null}
                    <TableCell className='font-mono text-xs'>
                      {actionLabel(record.action, t)}
                    </TableCell>
                    <TableCell>
                      <p>{resourceLabel(record.resource, t)}</p>
                      <p className='max-w-40 truncate font-mono text-xs text-muted-foreground'>
                        {record.resourceId ?? '—'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <ResultBadge result={record.result} />
                    </TableCell>
                    <TableCell>{sourceLabel(record.source, t)}</TableCell>
                    <TableCell className='text-right'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        aria-label={t('audit.details.view', {
                          defaultValue: 'View details',
                        })}
                        onClick={() => setSelected(record)}
                      >
                        <Eye aria-hidden='true' />
                        {t('audit.details.view', {
                          defaultValue: 'View details',
                        })}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
  );

  const dialog = (
    <AuditDetailDialog selected={selected} onClose={() => setSelected(null)} />
  );

  return variant === 'page' ? (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      {header}
      {content}
      {dialog}
    </main>
  ) : (
    <div className='space-y-5 pt-5'>
      {header}
      {content}
      {dialog}
    </div>
  );
}

function AuditDetailDialog({
  selected,
  onClose,
}: {
  readonly selected: AuditRecord | null;
  readonly onClose: () => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <Dialog
      modal={false}
      open={Boolean(selected)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className='max-h-[min(48rem,calc(100svh-2rem))] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {t('audit.details.title', { defaultValue: 'Audit event details' })}
          </DialogTitle>
          <DialogDescription>
            {t('audit.details.description', {
              defaultValue:
                'Identity, request context, affected object, and a redacted event payload.',
            })}
          </DialogDescription>
        </DialogHeader>
        {selected ? (
          <div className='space-y-5'>
            <dl className='grid gap-4 sm:grid-cols-2'>
              <Detail
                label={t('audit.details.time', { defaultValue: 'Time' })}
                value={formatDateTime(selected.createdAt, locale)}
              />
              <Detail
                label={t('audit.details.requestId', {
                  defaultValue: 'Request ID',
                })}
                value={selected.requestId}
                mono
              />
              <Detail
                label={t('audit.details.actor', { defaultValue: 'Actor' })}
                value={selected.actorName}
                secondary={`${selected.actorEmail ?? selected.actorId} · ${selected.actorId}`}
              />
              <Detail
                label={t('audit.details.application', {
                  defaultValue: 'Application',
                })}
                value={selected.applicationName}
                secondary={
                  selected.applicationId ??
                  t('audit.details.hubScope', { defaultValue: 'Hub scope' })
                }
              />
              <Detail
                label={t('audit.details.action', { defaultValue: 'Action' })}
                value={actionLabel(selected.action, t)}
                mono
              />
              <Detail
                label={t('audit.details.resource', {
                  defaultValue: 'Target object',
                })}
                value={resourceLabel(selected.resource, t)}
                secondary={selected.resourceId ?? '—'}
                mono
              />
              <div className='space-y-1'>
                <dt className='text-xs font-medium text-muted-foreground'>
                  {t('audit.details.result', { defaultValue: 'Result' })}
                </dt>
                <dd>
                  <ResultBadge result={selected.result} />
                </dd>
              </div>
              <Detail
                label={t('audit.details.source', { defaultValue: 'Source' })}
                value={sourceLabel(selected.source, t)}
              />
            </dl>

            <section className='space-y-2'>
              <h3 className='text-sm font-semibold'>
                {t('audit.details.clientMetadata', {
                  defaultValue: 'Client metadata',
                })}
              </h3>
              <dl className='grid gap-3 rounded-lg border bg-muted/25 p-3 sm:grid-cols-2'>
                <Detail
                  label={t('audit.details.clientName', {
                    defaultValue: 'Client',
                  })}
                  value={selected.client.name}
                />
                <Detail
                  label={t('audit.details.credentialId', {
                    defaultValue: 'Credential ID',
                  })}
                  value={selected.client.credentialId ?? '—'}
                  mono
                />
                <Detail
                  label={t('audit.details.ipAddress', {
                    defaultValue: 'IP address',
                  })}
                  value={selected.client.ipAddress}
                  mono
                />
                <Detail
                  label={t('audit.details.userAgent', {
                    defaultValue: 'User agent',
                  })}
                  value={selected.client.userAgent}
                />
              </dl>
            </section>

            <section className='space-y-2'>
              <h3 className='text-sm font-semibold'>
                {t('audit.details.safeJson', {
                  defaultValue: 'Details (safe JSON)',
                })}
              </h3>
              <pre className='max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all'>
                {safeJson(selected.details)}
              </pre>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ResultBadge({
  result,
}: {
  readonly result: AuditResult;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={result === 'success' ? 'default' : 'destructive'}>
      {resultLabel(result, t)}
    </Badge>
  );
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

function Detail({
  label,
  value,
  secondary,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly secondary?: string;
  readonly mono?: boolean;
}): ReactElement {
  return (
    <div className='min-w-0 space-y-1'>
      <dt className='text-xs font-medium text-muted-foreground'>{label}</dt>
      <dd
        className={mono ? 'break-all font-mono text-xs' : 'break-words text-sm'}
      >
        {value}
      </dd>
      {secondary ? (
        <dd className='break-all text-xs text-muted-foreground'>{secondary}</dd>
      ) : null}
    </div>
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

function actionLabel(action: string, t: Translate): string {
  return t(`audit.action.${action}`, { defaultValue: action });
}

function actionFilterLabel(action: string, t: Translate): string {
  const words = action.replaceAll('.', ' · ').replaceAll(/([A-Z])/g, ' $1');
  return t(`audit.actionOption.${action}`, {
    defaultValue: words.charAt(0).toLocaleUpperCase() + words.slice(1),
  });
}

function resourceLabel(resource: string, t: Translate): string {
  return t(`audit.resource.${resource}`, { defaultValue: resource });
}

function resultLabel(result: AuditResult, t: Translate): string {
  const labels: Record<AuditResult, string> = {
    success: t('audit.result.success', { defaultValue: 'Success' }),
    failure: t('audit.result.failure', { defaultValue: 'Failure' }),
    denied: t('audit.result.denied', { defaultValue: 'Denied' }),
  };
  return labels[result];
}

function sourceLabel(source: AuditSource, t: Translate): string {
  const labels: Record<AuditSource, string> = {
    web: t('audit.source.web', { defaultValue: 'Web console' }),
    agent: t('audit.source.agent', { defaultValue: 'Agent' }),
    system: t('audit.source.system', { defaultValue: 'System' }),
  };
  return labels[source];
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

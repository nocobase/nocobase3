import type { ReactNode } from 'react';
import {
  AlertCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileQuestion,
  Grid2X2,
  List,
} from 'lucide-react';
import { LoadingState } from './app-shell-loading-state.js';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './ui/empty.js';
import { Input } from './ui/input.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js';
import { Skeleton } from './ui/skeleton.js';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.js';
import { cn } from '../lib/utils.js';
import type { KnowledgeBaseType } from '../providers/index.js';
import { CompactNumber } from './compact-number.js';
import { useKnowledgeBaseComponentTranslate } from './i18n.js';

export type KnowledgeBaseLabels = {
  search?: string;
  previous?: string;
  next?: string;
  empty?: string;
  filteredEmpty?: string;
  retry?: string;
};
export function KnowledgeBaseTypeBadge({ type }: { type: KnowledgeBaseType }) {
  const t = useKnowledgeBaseComponentTranslate();
  const label =
    type === 'LOCAL'
      ? t('Local')
      : type === 'EXTERNAL'
        ? t('External')
        : type === 'READONLY'
          ? t('Read-only')
          : type;
  return (
    <Badge variant={type === 'LOCAL' ? 'default' : 'secondary'}>{label}</Badge>
  );
}

export function KnowledgeBaseMetric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value?: number | string;
  compact?: boolean;
}) {
  const displayValue =
    compact && typeof value === 'number' ? (
      <CompactNumber value={value} />
    ) : (
      (value ?? '—')
    );
  return (
    <div className='min-w-16'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='font-medium tabular-nums'>{displayValue}</dd>
    </div>
  );
}

export function KnowledgeBaseViewToggle({
  value,
  onValueChange,
  disabled = false,
}: {
  value: 'cards' | 'list';
  onValueChange: (view: 'cards' | 'list') => void;
  disabled?: boolean;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(values) => {
        const next = values[0];
        if (next === 'cards' || next === 'list') onValueChange(next);
      }}
      disabled={disabled}
      variant='outline'
      size='sm'
      aria-label={t('View layout')}
    >
      <ToggleGroupItem value='cards' aria-label={t('Card view')}>
        <Grid2X2 /> <span className='sr-only'>{t('Card view')}</span>
      </ToggleGroupItem>
      <ToggleGroupItem value='list' aria-label={t('List view')}>
        <List /> <span className='sr-only'>{t('List view')}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function KnowledgeBaseDirectoryToolbar({
  query,
  onQueryChange,
  view,
  onViewChange,
  leading,
  actions,
  labels,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  view?: 'cards' | 'list';
  onViewChange?: (view: 'cards' | 'list') => void;
  leading?: ReactNode;
  actions?: ReactNode;
  labels?: KnowledgeBaseLabels;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const search = labels?.search ?? t('Search knowledge bases');
  return (
    <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
      <div className='flex min-w-0 flex-1 items-center gap-2'>
        {leading}
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={search}
          aria-label={search}
        />
      </div>
      <div className='flex items-center gap-2'>
        {view && onViewChange ? (
          <KnowledgeBaseViewToggle value={view} onValueChange={onViewChange} />
        ) : null}
        {actions}
      </div>
    </div>
  );
}

function interpolatePaginationLabel(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (label, [key, value]) => label.split(`{{${key}}}`).join(String(value)),
    template,
  );
}

export function PagePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  labels: _labels,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  labels?: KnowledgeBaseLabels;
}) {
  void _labels;
  const t = useKnowledgeBaseComponentTranslate();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageSizeOptions = Array.from(
    new Set([10, 20, 30, 40, 50, pageSize]),
  ).sort((left, right) => left - right);
  return (
    <nav
      className='flex w-full flex-wrap items-center justify-between gap-2 px-2'
      aria-label={t('Pagination')}
    >
      <div className='flex-1 whitespace-nowrap text-sm text-muted-foreground'>
        {interpolatePaginationLabel(t('{{count}} row(s)'), { count: total })}
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        {onPageSizeChange ? (
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium'>{t('Rows per page')}</span>
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger className='h-8 w-[70px]'>
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side='top'>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className='flex flex-wrap items-center gap-2'>
          <div className='flex items-center justify-center text-sm font-medium'>
            {interpolatePaginationLabel(t('Page {{page}} of {{pages}}'), {
              page,
              pages,
            })}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              className='hidden h-8 w-8 p-0 lg:flex'
              onClick={() => onPageChange(1)}
              disabled={page === 1}
              aria-label={t('Go to first page')}
            >
              <ChevronsLeft />
            </Button>
            <Button
              variant='outline'
              className='h-8 w-8 p-0'
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              aria-label={t('Go to previous page')}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant='outline'
              className='h-8 w-8 p-0'
              onClick={() => onPageChange(page + 1)}
              disabled={page === pages}
              aria-label={t('Go to next page')}
            >
              <ChevronRight />
            </Button>
            <Button
              variant='outline'
              className='hidden h-8 w-8 p-0 lg:flex'
              onClick={() => onPageChange(pages)}
              disabled={page === pages}
              aria-label={t('Go to last page')}
            >
              <ChevronsRight />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export function KnowledgeBaseDirectorySkeleton({
  count = 6,
}: {
  count?: number;
}) {
  return (
    <div className='grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton className='h-44' key={index} />
      ))}
    </div>
  );
}

export function KnowledgeBaseDirectoryEmpty({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <BookOpen />
        </EmptyMedia>
        <EmptyTitle>{title ?? t('No knowledge bases')}</EmptyTitle>
        <EmptyDescription>
          {description ??
            t('There are no knowledge bases available to this user.')}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function KnowledgeBaseDirectoryFilteredEmpty({
  onClear,
  labels,
}: {
  onClear?: () => void;
  labels?: KnowledgeBaseLabels;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const filteredEmpty = labels?.filteredEmpty ?? t('No matching results');
  const retry = labels?.retry ?? t('Try again');
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <FileQuestion />
        </EmptyMedia>
        <EmptyTitle>{filteredEmpty}</EmptyTitle>
        <EmptyDescription>
          {t('Change the search or clear the current filter.')}
        </EmptyDescription>
      </EmptyHeader>
      {onClear ? (
        <EmptyContent>
          <Button variant='outline' onClick={onClear}>
            {retry}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export function KnowledgeBaseDirectoryError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const message =
    error instanceof Error
      ? error.message
      : t('The requested knowledge-base data could not be loaded.');
  return (
    <Alert variant='destructive'>
      <AlertCircle />
      <AlertTitle>{t('Unable to load this view')}</AlertTitle>
      <AlertDescription className='flex items-center justify-between gap-3'>
        <span>{message}</span>
        {onRetry ? (
          <Button variant='outline' size='sm' onClick={onRetry}>
            {t('Retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function AsyncInlineState({
  loading,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  return loading ? <LoadingState className='min-h-32' /> : <>{children}</>;
}

export const bookshelfMarker = 'border-l-3 border-l-primary/70';

export function cx(...values: Array<string | undefined | false>) {
  return cn(values);
}

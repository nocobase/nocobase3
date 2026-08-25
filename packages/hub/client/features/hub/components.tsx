import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Inbox,
  Loader2,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslate } from '@refinedev/core';
import { getCurrentLocale } from '@nocobase/app-portal-sdk/i18n';
import type { HubApiError } from './api';
import { getStatusLabel, getStatusVariant } from './status';

export function HubStatusBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  const translate = useTranslate();
  return (
    <Badge variant={getStatusVariant(status)}>
      {status === 'succeeded' ? <CheckCircle2 aria-hidden='true' /> : null}
      {getStatusLabel(status, translate)}
    </Badge>
  );
}

export function HubLoadingState({ label = 'Loading' }: { label?: string }) {
  const translate = useTranslate();
  const resolvedLabel =
    label === 'Loading' ? translate('hub.loading.default', 'Loading') : label;
  return (
    <div
      className='flex min-h-32 items-center justify-center'
      role='status'
      aria-label={resolvedLabel}
    >
      <Loader2
        className='size-5 animate-spin text-muted-foreground'
        aria-hidden='true'
      />
      <span className='sr-only'>{resolvedLabel}</span>
    </div>
  );
}

export function HubErrorState({
  error,
  onRetry,
  title = 'Unable to load Hub data',
}: {
  error: Error | null | undefined;
  onRetry?: () => void;
  title?: string;
}) {
  const translate = useTranslate();
  const message = getHubErrorMessage(error, translate);
  const resolvedTitle =
    title === 'Unable to load Hub data'
      ? translate('hub.error.defaultTitle', 'Unable to load Hub data')
      : title;

  return (
    <Alert variant='destructive'>
      <AlertCircle aria-hidden='true' />
      <AlertTitle>{resolvedTitle}</AlertTitle>
      <AlertDescription className='flex flex-wrap items-center gap-3'>
        <span>{message}</span>
        {onRetry ? (
          <Button type='button' variant='outline' size='sm' onClick={onRetry}>
            {translate('hub.common.tryAgain', 'Try again')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function getHubErrorMessage(
  error: Error | null | undefined,
  translate: ReturnType<typeof useTranslate>,
): string {
  const apiError = error as Partial<HubApiError> | null | undefined;
  const code = apiError?.code?.toUpperCase() ?? '';
  const status = apiError?.status;
  const isSimplifiedChinese =
    translate('locale.zh-CN', 'Simplified Chinese') === '简体中文';
  if (!isSimplifiedChinese && status !== 403 && status !== 404) {
    return (
      error?.message ||
      translate('hub.error.defaultMessage', 'Please try again.')
    );
  }
  if (status === 401 || code === 'UNAUTHORIZED') {
    return translate(
      'hub.error.unauthorized',
      'Your Hub session has expired. Sign in again.',
    );
  }
  if (status === 403 || code === 'FORBIDDEN') {
    return translate(
      'hub.error.forbidden',
      'You do not have permission to view this resource.',
    );
  }
  if (status === 404 || code.endsWith('_NOT_FOUND')) {
    return translate('hub.error.notFound', 'This resource could not be found.');
  }
  if (status === 409 || code.includes('CONFLICT')) {
    if (!isSimplifiedChinese) return error?.message ?? 'Conflict';
    return translate(
      'hub.error.conflict',
      'This information changed elsewhere. Reload and try again.',
    );
  }
  if (
    status === 422 ||
    code.includes('VALIDATION') ||
    code.startsWith('INVALID_')
  ) {
    if (!isSimplifiedChinese) return error?.message ?? 'Invalid request';
    return translate(
      'hub.error.invalidRequest',
      'Check the entered information and try again.',
    );
  }
  if (status === 0 || code === 'NETWORK_ERROR') {
    if (!isSimplifiedChinese) return error?.message ?? 'Network error';
    return translate(
      'hub.error.network',
      'Unable to reach Hub. Check the connection and retry.',
    );
  }
  if (status && status >= 500) {
    if (!isSimplifiedChinese) return error?.message ?? 'Server error';
    return translate(
      'hub.error.server',
      'Hub could not complete the request. Try again.',
    );
  }
  return translate('hub.error.defaultMessage', 'Please try again.');
}

export function HubEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Empty className='min-h-56 border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Inbox aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function HubNotFoundState({ kind }: { kind: string }) {
  const translate = useTranslate();
  const kindKey = kind.toLowerCase();
  const translatedKind = translate(`hub.${kindKey}.notFoundKind`, kind);
  return (
    <Empty className='min-h-64 border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <CircleHelp aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>
          {translate(
            'hub.notFound.title',
            { kind: translatedKind },
            `${kind} not found`,
          )}
        </EmptyTitle>
        <EmptyDescription>
          {translate(
            'hub.notFound.description',
            { kind: translatedKind },
            `The requested ${kind.toLowerCase()} is unavailable or you do not have access to it.`,
          )}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function HubListSkeleton({ rows = 4 }: { rows?: number }) {
  const translate = useTranslate();
  return (
    <div
      className='space-y-2'
      aria-label={translate('hub.loading.list', 'Loading list')}
      role='status'
    >
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className='h-12 w-full' />
      ))}
    </div>
  );
}

export function HubLoadMore({
  hasMore,
  loading,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const translate = useTranslate();
  if (!hasMore) return null;
  return (
    <div className='flex justify-center'>
      <Button
        type='button'
        variant='outline'
        disabled={loading}
        onClick={onLoadMore}
      >
        {loading
          ? translate('hub.common.loadingMore', 'Loading more…')
          : translate('hub.common.loadMore', 'Load more')}
      </Button>
    </div>
  );
}

export function formatHubDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(getCurrentLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatHubBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value < 1024 * 1024 * 1024 * 1024)
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(value / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
}

export function formatHubDuration(
  startedAt: string | null,
  finishedAt: string | null,
  translate: ReturnType<typeof useTranslate>,
): string {
  if (!startedAt) return '—';
  if (!finishedAt) return translate('hub.common.inProgress', 'In progress');
  const milliseconds =
    new Date(finishedAt).valueOf() - new Date(startedAt).valueOf();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const seconds = Math.round(milliseconds / 1000);
  const values: Array<[number, string, string]> = [
    [Math.floor(seconds / 3600), 'hub.duration.hours', '{{count}}h'],
    [Math.floor((seconds % 3600) / 60), 'hub.duration.minutes', '{{count}}m'],
    [seconds % 60, 'hub.duration.seconds', '{{count}}s'],
  ];
  const parts = values.flatMap(([count, key, fallback]) =>
    count
      ? [
          translate(key, { count }, fallback).replace(
            '{{count}}',
            String(count),
          ),
        ]
      : [],
  );
  return (
    parts.join(' ') ||
    translate('hub.duration.seconds', { count: 0 }, '{{count}}s').replace(
      '{{count}}',
      '0',
    )
  );
}

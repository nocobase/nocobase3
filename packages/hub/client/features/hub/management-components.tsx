import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useTranslate } from '@refinedev/core';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

export function HubPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className='flex flex-col gap-5 border-b border-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between'>
      <div className='min-w-0 space-y-1.5'>
        {eyebrow ? (
          <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground [&_svg]:size-4'>
            {eyebrow}
          </div>
        ) : null}
        <h1 className='font-heading text-2xl font-semibold tracking-tight sm:text-[1.75rem]'>
          {title}
        </h1>
        <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
          {description}
        </p>
      </div>
      {actions ? (
        <div className='flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end'>
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function HubSearchInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <label className='relative block min-w-0 flex-1 sm:min-w-64 sm:max-w-md'>
      <span className='sr-only'>{label}</span>
      <Search
        className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
        aria-hidden='true'
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className='pl-8'
      />
    </label>
  );
}

export function HubTablePagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const translate = useTranslate();
  return (
    <div className='flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
      <span>
        {translate('hub.pagination.summary', { total }, '{{total}} records')}
      </span>
      <div className='flex flex-wrap items-center gap-2'>
        <NativeSelect
          value={String(pageSize)}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          aria-label={translate('hub.pagination.pageSize', 'Rows per page')}
        >
          {[20, 50, 100].map((size) => (
            <NativeSelectOption key={size} value={String(size)}>
              {size} / {translate('hub.pagination.page', 'page')}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span className='min-w-20 text-center'>
          {page} / {pageCount}
        </span>
        <Button
          type='button'
          variant='outline'
          size='icon-sm'
          disabled={page <= 1}
          aria-label={translate('hub.pagination.previous', 'Previous page')}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden='true' />
        </Button>
        <Button
          type='button'
          variant='outline'
          size='icon-sm'
          disabled={page >= pageCount}
          aria-label={translate('hub.pagination.next', 'Next page')}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight aria-hidden='true' />
        </Button>
      </div>
    </div>
  );
}

export function roleName(
  role: string | { key?: string; name?: string },
): string {
  return typeof role === 'string' ? role : (role.name ?? role.key ?? '—');
}

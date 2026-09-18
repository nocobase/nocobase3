import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { useAuthorizationTranslation } from '../i18n.js';
import { FilterBar, FilterBarSpacer, SearchField } from './filters.js';
import {
  PAGE_SIZE,
  clampPage,
  pageCount,
  pageNumbers,
  pageRangeLabel,
} from './pagination.js';
import { Button } from './ui/button.js';
import { Card } from './ui/card.js';
import { TableCell, TableRow } from './ui/table.js';

export function ManagementToolbar({
  search,
  searchLabel,
  searchPlaceholder,
  onSearch,
  actionLabel,
  onAction,
  filters,
}: {
  filters?: ReactNode;
  search: string;
  /** What the field searches, for anyone who cannot see the placeholder. */
  searchLabel?: string;
  searchPlaceholder?: string;
  onSearch: (value: string) => void;
  actionLabel: string;
  onAction: () => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <FilterBar>
      {/* The search field clears itself, so this bar needs no separate clear control. */}
      <SearchField
        label={searchLabel ?? t('common.search')}
        placeholder={searchPlaceholder ?? t('common.search')}
        value={search}
        onChange={onSearch}
      />
      {filters}
      <FilterBarSpacer />
      <Button onClick={onAction}>{actionLabel}</Button>
    </FilterBar>
  );
}

/** Pages rows the panel already holds. It never asks the server for another page. */
export function TablePager({
  total,
  page,
  pageSize = PAGE_SIZE,
  label,
  onPage,
}: {
  total: number;
  page: number;
  pageSize?: number;
  /** What is being paged, so several pagers on one screen stay distinguishable. */
  label: string;
  onPage: (page: number) => void;
}): ReactElement | null {
  const t = useAuthorizationTranslation();
  if (total === 0) return null;
  const current = clampPage(page, total, pageSize);
  const pages = pageCount(total, pageSize);
  const numbers = pageNumbers(total, pageSize);
  return (
    <nav
      aria-label={t('pagination.navLabel', { label })}
      className='flex items-center gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground'
    >
      <span className='tabular-nums'>
        {pageRangeLabel(t, total, current, pageSize)}
      </span>
      <span className='flex-1' />
      <div className='flex items-center gap-1'>
        <Button
          aria-label={t('pagination.previous')}
          disabled={current === 1}
          size='sm'
          variant='outline'
          onClick={() => onPage(current - 1)}
        >
          <ChevronLeft />
        </Button>
        {numbers.map((number) => (
          <Button
            key={number}
            aria-current={number === current ? 'page' : undefined}
            aria-label={t('pagination.page', { number })}
            size='sm'
            variant={number === current ? 'default' : 'outline'}
            onClick={() => onPage(number)}
          >
            {number}
          </Button>
        ))}
        <Button
          aria-label={t('pagination.next')}
          disabled={current === pages}
          size='sm'
          variant='outline'
          onClick={() => onPage(current + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

export function ManagementTable({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <Card className='overflow-hidden'>{children}</Card>;
}

export function EmptyTableRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}): ReactElement {
  return (
    <TableRow className='hover:bg-transparent'>
      <TableCell
        className='px-5 py-12 text-center text-sm text-muted-foreground'
        colSpan={colSpan}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

export function DetailHeader({
  onBack,
  title,
  subtitle,
  badge,
  actions,
}: {
  onBack: () => void;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}): ReactElement {
  const t = useAuthorizationTranslation();
  // The page header of a list page, with the back control above it: a detail view is the page, not a card on it.
  return (
    <header>
      <Button
        className='-ml-2 text-muted-foreground'
        size='sm'
        variant='ghost'
        onClick={onBack}
      >
        {t('common.backToList')}
      </Button>
      <div className='mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <div className='flex flex-wrap items-center gap-2'>
            <h2 className='text-xl font-semibold tracking-tight'>{title}</h2>
            {badge}
          </div>
          {subtitle ? (
            <p className='mt-1 text-sm text-muted-foreground'>{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className='flex gap-2'>{actions}</div> : null}
      </div>
    </header>
  );
}

export function DetailTabs({
  value,
  items,
  onChange,
}: {
  value: string;
  items: readonly { value: string; label: string; count?: number }[];
  onChange: (value: string) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <nav
      className='flex gap-6 border-b px-1'
      aria-label={t('common.detailSections')}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type='button'
          className={`border-b-2 px-1 py-3 text-sm font-medium ${value === item.value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count === undefined ? null : (
            <span className='ml-2 rounded-full bg-muted px-2 py-0.5 text-xs'>
              {item.count}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

export function SidePanel({
  title,
  description,
  onClose,
  children,
  wide = false,
  scrollable = true,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  scrollable?: boolean;
}): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <div
      className='fixed inset-0 z-50 flex justify-end bg-black/30'
      role='presentation'
      onMouseDown={onClose}
    >
      <section
        className={`flex h-full w-full flex-col overflow-hidden border-l bg-background shadow-2xl ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}
        role='dialog'
        aria-modal='true'
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className='z-10 flex shrink-0 items-start justify-between border-b bg-background px-6 py-5'>
          <div>
            <h2 className='text-lg font-semibold'>{title}</h2>
            {description ? (
              <p className='mt-1 text-sm text-muted-foreground'>
                {description}
              </p>
            ) : null}
          </div>
          <Button size='sm' variant='ghost' onClick={onClose}>
            {t('common.close')}
          </Button>
        </header>
        <div
          className={`min-h-0 flex-1 ${scrollable ? 'overflow-y-auto p-6' : 'overflow-hidden'}`}
        >
          {children}
        </div>
      </section>
    </div>
  );
}

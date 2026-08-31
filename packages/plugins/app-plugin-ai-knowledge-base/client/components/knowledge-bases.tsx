import type { ReactNode, SyntheticEvent } from 'react';
import { CalendarDays, ChevronRight } from 'lucide-react';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card.js';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from './ui/item.js';
import type { KnowledgeBase } from '../providers/index.js';
import {
  PagePagination,
  KnowledgeBaseDirectoryToolbar,
  KnowledgeBaseMetric,
  KnowledgeBaseTypeBadge,
  bookshelfMarker,
  cx,
  type KnowledgeBaseLabels,
} from './common.js';
import { useKnowledgeBaseComponentTranslate } from './i18n.js';

function stopCardNavigation(event: SyntheticEvent) {
  event.stopPropagation();
}

function KnowledgeBaseCreatedAt({ value }: { value?: string }) {
  const t = useKnowledgeBaseComponentTranslate();
  const date = value ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime())) {
    return (
      <span className='inline-flex items-center gap-1.5 text-sm text-muted-foreground'>
        <CalendarDays className='size-3.5' aria-hidden='true' />
        <span>—</span>
      </span>
    );
  }

  const fullDate = date.toLocaleString(undefined, {
    dateStyle: 'full',
    timeStyle: 'medium',
  });
  const shortDate = date.toISOString().slice(0, 10);
  return (
    <span className='inline-flex items-center gap-1.5 text-sm text-muted-foreground'>
      <CalendarDays className='size-3.5' aria-hidden='true' />
      <time
        dateTime={value}
        title={fullDate}
        aria-label={t('Created {{date}}', { date: fullDate })}
      >
        {shortDate}
      </time>
    </span>
  );
}

export function KnowledgeBaseCard({
  item,
  onOpen,
  menu,
  enabledControl,
}: {
  item: KnowledgeBase;
  onOpen?: (item: KnowledgeBase) => void;
  menu?: ReactNode;
  enabledControl?: ReactNode;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <Card
      className={cx(
        'relative',
        bookshelfMarker,
        onOpen &&
          'cursor-pointer transition-shadow duration-150 hover:shadow-md motion-reduce:transition-none',
      )}
    >
      {onOpen ? (
        <button
          type='button'
          aria-label={t('Open {{name}}', { name: item.name })}
          className='absolute inset-0 z-0 cursor-pointer rounded-xl focus-visible:ring-3 focus-visible:ring-ring'
          onClick={() => onOpen(item)}
        />
      ) : null}
      {menu ? (
        <div
          className='pointer-events-auto absolute top-3 right-3 z-30'
          onClick={stopCardNavigation}
          onKeyDown={stopCardNavigation}
        >
          {menu}
        </div>
      ) : null}
      <CardHeader
        className={cx(
          'relative',
          onOpen && 'z-10 pointer-events-none',
          'gap-2',
        )}
      >
        <CardTitle className='truncate' title={item.name}>
          {item.name}
        </CardTitle>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
          <KnowledgeBaseTypeBadge type={item.knowledgeBaseType} />
          <KnowledgeBaseCreatedAt value={item.createdAt} />
        </div>
        <CardDescription className='min-h-10 line-clamp-2'>
          {item.description}
        </CardDescription>
      </CardHeader>
      <CardFooter className='relative z-10 items-center justify-between gap-4'>
        <dl
          className={cx(
            'flex shrink-0 flex-nowrap gap-x-4 whitespace-nowrap',
            onOpen && 'pointer-events-none',
          )}
        >
          <KnowledgeBaseMetric
            label={t('Documents')}
            value={item.documentCount}
          />
          <KnowledgeBaseMetric
            label={t('Characters')}
            value={item.characterCount}
            compact
          />
          <KnowledgeBaseMetric
            label={t('AI Employees')}
            value={item.aiEmployeeCount}
          />
        </dl>
        {enabledControl ? (
          <div
            className='pointer-events-auto flex items-center gap-2'
            onClick={stopCardNavigation}
            onKeyDown={stopCardNavigation}
          >
            {enabledControl}
          </div>
        ) : null}
      </CardFooter>
    </Card>
  );
}

export function KnowledgeBaseCardGrid({
  items,
  onItemOpen,
  renderMenu,
  renderEnabledControl,
  renderActions,
}: {
  items: KnowledgeBase[];
  onItemOpen?: (item: KnowledgeBase) => void;
  renderMenu?: (item: KnowledgeBase) => ReactNode;
  renderEnabledControl?: (item: KnowledgeBase) => ReactNode;
  renderActions?: (item: KnowledgeBase) => ReactNode;
}) {
  return (
    <div className='grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
      {items.map((item) => (
        <KnowledgeBaseCard
          key={item.id}
          item={item}
          onOpen={onItemOpen}
          menu={renderMenu?.(item) ?? renderActions?.(item)}
          enabledControl={renderEnabledControl?.(item)}
        />
      ))}
    </div>
  );
}

export function KnowledgeBaseListItem({
  item,
  onOpen,
  actions,
}: {
  item: KnowledgeBase;
  onOpen?: (item: KnowledgeBase) => void;
  actions?: ReactNode;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <Item
      variant='outline'
      className={cx(
        'relative !grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto]',
        bookshelfMarker,
        onOpen &&
          'cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted motion-reduce:transition-none',
      )}
    >
      {onOpen ? (
        <button
          type='button'
          aria-label={t('Open {{name}}', { name: item.name })}
          className='absolute inset-0 z-0 cursor-pointer rounded-xl focus-visible:ring-3 focus-visible:ring-ring'
          onClick={() => onOpen(item)}
        />
      ) : null}
      <ItemContent
        className={cx(
          'relative z-10 min-w-0 gap-2',
          onOpen && 'pointer-events-none',
        )}
      >
        <ItemHeader className='justify-start'>
          <ItemTitle className='truncate text-base' title={item.name}>
            {item.name}
          </ItemTitle>
        </ItemHeader>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
          <KnowledgeBaseTypeBadge type={item.knowledgeBaseType} />
          <KnowledgeBaseCreatedAt value={item.createdAt} />
        </div>
        <ItemDescription className='min-h-5 line-clamp-1'>
          {item.description}
        </ItemDescription>
      </ItemContent>
      <dl
        className={cx(
          'relative z-10 col-span-2 grid grid-cols-3 gap-x-6 border-t pt-3 whitespace-nowrap md:col-span-1 md:col-start-2 md:row-start-1 md:min-w-88 md:border-t-0 md:border-l md:py-1 md:pl-6',
          onOpen && 'pointer-events-none',
        )}
      >
        <KnowledgeBaseMetric
          label={t('Documents')}
          value={item.documentCount}
        />
        <KnowledgeBaseMetric
          label={t('Characters')}
          value={item.characterCount}
          compact
        />
        <KnowledgeBaseMetric
          label={t('AI Employees')}
          value={item.aiEmployeeCount}
        />
      </dl>
      <div
        className={cx(
          'relative z-10 col-start-2 row-start-1 ml-auto self-center md:col-start-3',
          !!actions && 'pointer-events-auto z-20',
        )}
        onClick={actions ? stopCardNavigation : undefined}
        onKeyDown={actions ? stopCardNavigation : undefined}
      >
        {actions ??
          (onOpen ? <ChevronRight className='text-muted-foreground' /> : null)}
      </div>
    </Item>
  );
}

export function KnowledgeBaseList({
  items,
  onItemOpen,
  renderActions,
}: {
  items: KnowledgeBase[];
  onItemOpen?: (item: KnowledgeBase) => void;
  renderActions?: (item: KnowledgeBase) => ReactNode;
}) {
  return (
    <ItemGroup>
      {items.map((item) => (
        <KnowledgeBaseListItem
          key={item.id}
          item={item}
          onOpen={onItemOpen}
          actions={renderActions?.(item)}
        />
      ))}
    </ItemGroup>
  );
}

type BaseDirectoryProps = {
  items: KnowledgeBase[];
  query: string;
  onQueryChange: (value: string) => void;
  onItemOpen?: (item: KnowledgeBase) => void;
  leading?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  renderActions?: (item: KnowledgeBase) => ReactNode;
  labels?: KnowledgeBaseLabels;
};

function Directory({
  layout,
  items,
  query,
  onQueryChange,
  onItemOpen,
  leading,
  actions,
  footer,
  renderActions,
  labels,
}: BaseDirectoryProps & { layout: 'cards' | 'list' }) {
  return (
    <section className='space-y-4'>
      <KnowledgeBaseDirectoryToolbar
        query={query}
        onQueryChange={onQueryChange}
        leading={leading}
        actions={actions}
        labels={labels}
      />
      {layout === 'cards' ? (
        <KnowledgeBaseCardGrid
          items={items}
          onItemOpen={onItemOpen}
          renderActions={renderActions}
        />
      ) : (
        <KnowledgeBaseList
          items={items}
          onItemOpen={onItemOpen}
          renderActions={renderActions}
        />
      )}
      {footer}
    </section>
  );
}

export function KnowledgeBaseCardDirectory(props: BaseDirectoryProps) {
  return <Directory layout='cards' {...props} />;
}

export function KnowledgeBaseListDirectory(props: BaseDirectoryProps) {
  return <Directory layout='list' {...props} />;
}

export function KnowledgeBaseSwitchableDirectory(
  props: BaseDirectoryProps & {
    view: 'cards' | 'list';
    onViewChange: (view: 'cards' | 'list') => void;
  },
) {
  return (
    <section className='space-y-4'>
      <KnowledgeBaseDirectoryToolbar
        query={props.query}
        onQueryChange={props.onQueryChange}
        view={props.view}
        onViewChange={props.onViewChange}
        leading={props.leading}
        actions={props.actions}
        labels={props.labels}
      />
      {props.view === 'cards' ? (
        <KnowledgeBaseCardGrid
          items={props.items}
          onItemOpen={props.onItemOpen}
          renderActions={props.renderActions}
        />
      ) : (
        <KnowledgeBaseList
          items={props.items}
          onItemOpen={props.onItemOpen}
          renderActions={props.renderActions}
        />
      )}
      {props.footer}
    </section>
  );
}

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

export function PaginatedKnowledgeBaseCardDirectory(
  props: BaseDirectoryProps & { pagination: Pagination },
) {
  return (
    <KnowledgeBaseCardDirectory
      {...props}
      footer={<PagePagination {...props.pagination} labels={props.labels} />}
    />
  );
}

export function PaginatedKnowledgeBaseListDirectory(
  props: BaseDirectoryProps & { pagination: Pagination },
) {
  return (
    <KnowledgeBaseListDirectory
      {...props}
      footer={<PagePagination {...props.pagination} labels={props.labels} />}
    />
  );
}

export function PaginatedKnowledgeBaseSwitchableDirectory(
  props: Omit<
    Parameters<typeof KnowledgeBaseSwitchableDirectory>[0],
    'footer'
  > & {
    pagination: Pagination;
  },
) {
  return (
    <KnowledgeBaseSwitchableDirectory
      {...props}
      footer={<PagePagination {...props.pagination} labels={props.labels} />}
    />
  );
}

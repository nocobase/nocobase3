import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  CircleAlert,
  Download,
  FileText,
  MoreHorizontal,
  PanelsTopLeft,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  isKnowledgeBaseDocumentProcessing,
  type KnowledgeBaseDocument,
} from '@/extensions/nocobase-ai-knowledge-base-providers';
import { PagePagination, bookshelfMarker } from './common.js';
import { CompactNumber } from './compact-number.js';
import { useKnowledgeBaseComponentTranslate } from './i18n.js';

function documentFileName(document: KnowledgeBaseDocument, untitled: string) {
  const name = document.title || document.filename || untitled;
  const extension = document.extname;
  return extension && !name.toLowerCase().endsWith(extension.toLowerCase())
    ? `${name}${extension}`
    : name;
}

function documentError(document: KnowledgeBaseDocument) {
  return document.errorMessage || document.segmentErrorMessage;
}

function isDocumentFailed(document: KnowledgeBaseDocument) {
  return (
    !!documentError(document) ||
    document.indexStatus === 'FAILED' ||
    document.indexStatus === 'ERROR'
  );
}

export function DocumentIdentity({
  document,
}: {
  document: KnowledgeBaseDocument;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <div className='min-w-0'>
      <div className='truncate font-medium'>
        {documentFileName(document, t('Untitled document'))}
      </div>
      <div className='truncate text-xs text-muted-foreground'>
        {document.filename || document.key || String(document.id)}
      </div>
    </div>
  );
}

function DocumentFileName({ document }: { document: KnowledgeBaseDocument }) {
  const t = useKnowledgeBaseComponentTranslate();
  const error = documentError(document);
  const fileName = documentFileName(document, t('Untitled document'));
  const failedLabel = t('Document indexing failed');
  return (
    <div className='flex min-w-0 items-center gap-2'>
      {isDocumentFailed(document) ? (
        <span
          className='shrink-0 text-destructive'
          title={error ?? failedLabel}
        >
          <CircleAlert aria-hidden='true' className='size-4' />
          <span className='sr-only'>{failedLabel}</span>
        </span>
      ) : null}
      <span className='truncate font-medium' title={fileName}>
        {fileName}
      </span>
    </div>
  );
}

function DocumentTimestamp({ value }: { value?: string }) {
  if (!value) return <>—</>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>{value}</span>;
  const display = date.toLocaleDateString();
  const fullDateTime = date.toLocaleString();
  return (
    <time
      dateTime={value}
      title={fullDateTime}
      className='block max-w-full truncate tabular-nums text-muted-foreground'
    >
      {display}
    </time>
  );
}

export function DocumentOwnershipBadge({ owned }: { owned: boolean }) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <Badge variant={owned ? 'default' : 'secondary'}>
      {owned ? t('Mine') : t('Shared')}
    </Badge>
  );
}

export function DocumentIndexStatusBadge({
  status,
  error,
}: {
  status?: string;
  error?: string;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const failed = !!error || status === 'FAILED' || status === 'ERROR';
  return (
    <Badge
      title={error}
      variant={
        failed ? 'destructive' : status === 'SUCCESS' ? 'default' : 'secondary'
      }
    >
      {failed ? t('Failed') : status || t('Pending')}
    </Badge>
  );
}

export function DocumentMetrics({
  document,
}: {
  document: KnowledgeBaseDocument;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <dl className='flex flex-wrap gap-3 text-xs text-muted-foreground'>
      <div>
        <dt className='sr-only'>{t('Segments')}</dt>
        <dd>
          {t('{{count}} segments', { count: document.segmentCount ?? 0 })}
        </dd>
      </div>
      <div>
        <dt className='sr-only'>{t('Characters')}</dt>
        <dd>{t('{{count}} chars', { count: document.characterCount ?? 0 })}</dd>
      </div>
      <div>
        <dt className='sr-only'>{t('Size')}</dt>
        <dd>{document.size ? `${Math.ceil(document.size / 1024)} KB` : '—'}</dd>
      </div>
    </dl>
  );
}

type DocumentAction = {
  label: string;
  Icon: LucideIcon;
  disabled?: boolean;
  destructive?: boolean;
  title?: string;
  onClick: () => void;
};

function DocumentActionButton({ action }: { action: DocumentAction }) {
  const { Icon, destructive, label } = action;
  return (
    <Button
      variant='ghost'
      size='sm'
      disabled={action.disabled}
      title={action.title}
      className={
        destructive
          ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
          : undefined
      }
      onClick={action.onClick}
    >
      <Icon aria-hidden='true' />
      {label}
    </Button>
  );
}

export function DocumentActionsMenu({
  document,
  canMaintain = false,
  onOpen,
  onDownload,
  onDelete,
  onVectorize,
}: {
  document: KnowledgeBaseDocument;
  canMaintain?: boolean;
  onOpen?: (document: KnowledgeBaseDocument) => void;
  onDownload?: (document: KnowledgeBaseDocument) => void;
  onDelete?: (document: KnowledgeBaseDocument) => void;
  onVectorize?: (document: KnowledgeBaseDocument) => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const containerRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const segmentsPending = isKnowledgeBaseDocumentProcessing(document);
  const actions: DocumentAction[] = [
    {
      label: t('Segments'),
      Icon: PanelsTopLeft,
      disabled: !onOpen,
      title: segmentsPending ? t('Segments are being generated') : undefined,
      onClick: () => onOpen?.(document),
    },
    {
      label: t('Download'),
      Icon: Download,
      disabled: !onDownload,
      onClick: () => onDownload?.(document),
    },
    ...(canMaintain && onVectorize
      ? [
          {
            label: t('Vectorize'),
            Icon: RefreshCw,
            onClick: () => onVectorize(document),
          },
        ]
      : []),
    ...(canMaintain && onDelete
      ? [
          {
            label: t('Delete'),
            Icon: Trash2,
            destructive: true,
            onClick: () => onDelete(document),
          },
        ]
      : []),
  ];
  const [inlineActionCount, setInlineActionCount] = useState(actions.length);
  const visibleActions = actions.slice(0, inlineActionCount);
  const overflowActions = actions.slice(inlineActionCount);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const actionList = actionsRef.current;
    if (!container || !actionList) return;

    const updateVisibleActions = () => {
      const actionWidths = Array.from(
        actionList.children,
        (action) => action.getBoundingClientRect().width,
      );
      const gap =
        Number.parseFloat(getComputedStyle(actionList).columnGap) || 0;
      const availableWidth = container.getBoundingClientRect().width;
      const allActionsWidth =
        actionWidths.reduce((total, width) => total + width, 0) +
        gap * (actionWidths.length - 1);
      let nextInlineActionCount = actionWidths.length;

      if (allActionsWidth > availableWidth) {
        const overflowMenuWidth = 28;
        let occupiedWidth = overflowMenuWidth;
        nextInlineActionCount = 0;

        for (const actionWidth of actionWidths) {
          const nextOccupiedWidth = occupiedWidth + gap + actionWidth;
          if (nextOccupiedWidth > availableWidth) break;
          occupiedWidth = nextOccupiedWidth;
          nextInlineActionCount += 1;
        }
      }

      setInlineActionCount((current) =>
        current === nextInlineActionCount ? current : nextInlineActionCount,
      );
    };

    updateVisibleActions();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateVisibleActions);
    observer.observe(container);
    observer.observe(actionList);
    return () => observer.disconnect();
  }, [actions.length]);

  return (
    <div ref={containerRef} className='relative w-full'>
      <div
        ref={actionsRef}
        aria-hidden='true'
        className='pointer-events-none invisible absolute flex min-w-max items-center gap-1 whitespace-nowrap'
      >
        {actions.map((action) => (
          <DocumentActionButton key={action.label} action={action} />
        ))}
      </div>
      <div className='flex items-center gap-1 whitespace-nowrap'>
        {visibleActions.map((action) => (
          <DocumentActionButton key={action.label} action={action} />
        ))}
        {overflowActions.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('More document actions')}
                  title={t('More document actions')}
                >
                  <MoreHorizontal aria-hidden='true' />
                </Button>
              }
            />
            <DropdownMenuContent align='start' className='w-44'>
              {overflowActions.map(
                ({ Icon, destructive, label, ...action }) => (
                  <DropdownMenuItem
                    key={label}
                    disabled={action.disabled}
                    variant={destructive ? 'destructive' : 'default'}
                    onClick={action.onClick}
                  >
                    <Icon aria-hidden='true' />
                    {label}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentManagementToolbar({
  query,
  onQueryChange,
  actions,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  actions?: ReactNode;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const search = t('Search documents');
  return (
    <div className='flex flex-col gap-3 sm:flex-row'>
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={search}
        aria-label={search}
      />
      <div className='flex gap-2'>{actions}</div>
    </div>
  );
}

type DocumentProps = {
  documents: KnowledgeBaseDocument[];
  canMaintain?: (document: KnowledgeBaseDocument) => boolean;
  onOpen?: (document: KnowledgeBaseDocument) => void;
  onDownload?: (document: KnowledgeBaseDocument) => void;
  onDelete?: (document: KnowledgeBaseDocument) => void;
  onVectorize?: (document: KnowledgeBaseDocument) => void;
};

export function DocumentTable(props: DocumentProps) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <div className='overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]'>
      <Table className='table-fixed'>
        <TableHeader className='bg-muted/45'>
          <TableRow>
            <TableHead className='w-[6%] whitespace-normal break-words leading-tight'>
              {t('ID')}
            </TableHead>
            <TableHead className='w-[20%] whitespace-normal break-words leading-tight'>
              {t('Filename')}
            </TableHead>
            <TableHead className='w-[11%] whitespace-normal break-words leading-tight'>
              {t('Status')}
            </TableHead>
            <TableHead className='w-[9%] whitespace-normal break-words leading-tight'>
              {t('Characters')}
            </TableHead>
            <TableHead className='w-[9%] whitespace-normal break-words leading-tight'>
              {t('Segments')}
            </TableHead>
            <TableHead className='w-[10%] whitespace-normal break-words leading-tight'>
              {t('Created at')}
            </TableHead>
            <TableHead className='w-[10%] whitespace-normal break-words leading-tight'>
              {t('Updated at')}
            </TableHead>
            <TableHead className='w-[21%] whitespace-normal break-words leading-tight'>
              {t('Actions')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.documents.map((document) => (
            <TableRow key={document.id}>
              <TableCell className='overflow-hidden truncate tabular-nums text-muted-foreground'>
                {document.id}
              </TableCell>
              <TableCell className='overflow-hidden'>
                <DocumentFileName document={document} />
              </TableCell>
              <TableCell className='overflow-hidden'>
                <DocumentIndexStatusBadge
                  status={document.indexStatus || document.segmentStatus}
                  error={documentError(document)}
                />
              </TableCell>
              <TableCell className='overflow-hidden tabular-nums'>
                <CompactNumber value={document.characterCount} />
              </TableCell>
              <TableCell className='overflow-hidden tabular-nums'>
                <CompactNumber value={document.segmentCount} />
              </TableCell>
              <TableCell className='overflow-hidden'>
                <DocumentTimestamp value={document.createdAt} />
              </TableCell>
              <TableCell className='overflow-hidden'>
                <DocumentTimestamp value={document.updatedAt} />
              </TableCell>
              <TableCell className='overflow-hidden'>
                <div className='-ml-3 mr-3'>
                  <DocumentActionsMenu
                    document={document}
                    canMaintain={props.canMaintain?.(document)}
                    onOpen={props.onOpen}
                    onDownload={props.onDownload}
                    onDelete={props.onDelete}
                    onVectorize={props.onVectorize}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DocumentList(props: DocumentProps) {
  return (
    <ItemGroup>
      {props.documents.map((document) => (
        <Item key={document.id} variant='outline' className={bookshelfMarker}>
          <ItemMedia variant='icon'>
            <FileText />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              <DocumentIdentity document={document} />
            </ItemTitle>
            <ItemDescription>
              <DocumentMetrics document={document} />
            </ItemDescription>
          </ItemContent>
          <DocumentActionsMenu
            document={document}
            canMaintain={props.canMaintain?.(document)}
            onOpen={props.onOpen}
            onDownload={props.onDownload}
            onDelete={props.onDelete}
            onVectorize={props.onVectorize}
          />
        </Item>
      ))}
    </ItemGroup>
  );
}

export function DocumentCardGrid(props: DocumentProps) {
  return (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
      {props.documents.map((document) => (
        <Card key={document.id} className={bookshelfMarker}>
          <CardHeader>
            <CardTitle>
              <DocumentIdentity document={document} />
            </CardTitle>
            <CardDescription>
              <DocumentIndexStatusBadge
                status={document.indexStatus || document.segmentStatus}
                error={document.errorMessage || document.segmentErrorMessage}
              />
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <DocumentMetrics document={document} />
            <DocumentActionsMenu
              document={document}
              canMaintain={props.canMaintain?.(document)}
              onOpen={props.onOpen}
              onDownload={props.onDownload}
              onDelete={props.onDelete}
              onVectorize={props.onVectorize}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DocumentSplitView({
  documents,
  selectedId,
  onSelectionChange,
  detail,
  ...props
}: DocumentProps & {
  selectedId?: string | number;
  onSelectionChange: (id: string | number) => void;
  detail: ReactNode;
}) {
  return (
    <div className='grid gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.6fr)]'>
      <div className='max-h-[65vh] overflow-auto'>
        <DocumentList
          documents={documents}
          {...props}
          onOpen={(document) => onSelectionChange(document.id)}
        />
      </div>
      <div
        className='rounded-xl border p-4'
        data-selected-document={selectedId}
      >
        {detail}
      </div>
    </div>
  );
}

export function PaginatedDocumentTable(
  props: DocumentProps & {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      onPageChange: (page: number) => void;
    };
  },
) {
  return (
    <div className='space-y-4'>
      <DocumentTable {...props} />
      <PagePagination {...props.pagination} />
    </div>
  );
}

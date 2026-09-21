import { useTranslation } from '@nocobase/i18n/client';
import {
  CopyIcon,
  EyeIcon,
  PencilIcon,
  TruckIcon,
  XCircleIcon,
} from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

import { ExamplePage, ExampleSection } from '../shared';

const TRIGGER_CLASS =
  'flex h-32 w-full max-w-xs items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground';

type SortField = 'name' | 'date' | 'amount';

function isSortField(value: unknown): value is SortField {
  return value === 'name' || value === 'date' || value === 'amount';
}

export default function ContextMenuExamplePage(): ReactElement {
  const { t } = useTranslation();
  const [showArchived, setShowArchived] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [lastAction, setLastAction] = useState<string | null>(null);

  return (
    <ExamplePage
      title={t('devComponents.contextMenu.title')}
      description={t('devComponents.contextMenu.description')}
      source='client/pages/dev/components/context-menu.tsx'
      docs='https://ui.shadcn.com/docs/components/context-menu'
    >
      <ExampleSection
        title={t('devComponents.contextMenu.basic')}
        description={t('devComponents.contextMenu.basicDescription')}
      >
        <ContextMenu>
          <ContextMenuTrigger className={TRIGGER_CLASS}>
            {t('devComponents.contextMenu.rightClickHere')}
          </ContextMenuTrigger>
          <ContextMenuContent className='w-48'>
            <ContextMenuGroup>
              <ContextMenuItem>
                {t('devCommon.back')}
                <ContextMenuShortcut>⌘[</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem disabled>
                {t('devComponents.contextMenu.forward')}
                <ContextMenuShortcut>⌘]</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem>
                {t('devCommon.refresh')}
                <ContextMenuShortcut>⌘R</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem>
                {t('devComponents.contextMenu.saveAs')}
                <ContextMenuShortcut>⌘S</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem>
                {t('devComponents.contextMenu.print')}
                <ContextMenuShortcut>⌘P</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.contextMenu.submenu')}
        description={t('devComponents.contextMenu.submenuDescription')}
      >
        <ContextMenu>
          <ContextMenuTrigger className={TRIGGER_CLASS}>
            {t('devComponents.contextMenu.rightClickHere')}
          </ContextMenuTrigger>
          <ContextMenuContent className='w-48'>
            <ContextMenuGroup>
              <ContextMenuItem>{t('devCommon.open')}</ContextMenuItem>
              <ContextMenuItem>{t('devCommon.edit')}</ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  {t('devCommon.share')}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className='w-44'>
                  <ContextMenuGroup>
                    <ContextMenuItem>{t('devCommon.email')}</ContextMenuItem>
                    <ContextMenuItem>
                      {t('devComponents.contextMenu.message')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem>
                      {t('devComponents.contextMenu.copyLink')}
                    </ContextMenuItem>
                  </ContextMenuGroup>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  {t('devComponents.contextMenu.moveTo')}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className='w-44'>
                  <ContextMenuGroup>
                    <ContextMenuItem>
                      {t('devComponents.contextMenu.folderProjects')}
                    </ContextMenuItem>
                    <ContextMenuItem>
                      {t('devComponents.contextMenu.folderShared')}
                    </ContextMenuItem>
                    <ContextMenuItem>
                      {t('devComponents.contextMenu.folderArchive')}
                    </ContextMenuItem>
                  </ContextMenuGroup>
                </ContextMenuSubContent>
              </ContextMenuSub>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.contextMenu.options')}
        description={t('devComponents.contextMenu.optionsDescription')}
      >
        <ContextMenu>
          <ContextMenuTrigger className={TRIGGER_CLASS}>
            {t('devComponents.contextMenu.rightClickHere')}
          </ContextMenuTrigger>
          <ContextMenuContent className='w-52'>
            <ContextMenuGroup>
              <ContextMenuLabel>
                {t('devComponents.contextMenu.view')}
              </ContextMenuLabel>
              <ContextMenuCheckboxItem
                checked={showArchived}
                onCheckedChange={(checked) => setShowArchived(checked)}
              >
                {t('devComponents.contextMenu.showArchived')}
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem
                checked={showCompleted}
                onCheckedChange={(checked) => setShowCompleted(checked)}
              >
                {t('devComponents.contextMenu.showCompleted')}
              </ContextMenuCheckboxItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuLabel>
                {t('devComponents.contextMenu.sortBy')}
              </ContextMenuLabel>
              <ContextMenuRadioGroup
                value={sortBy}
                onValueChange={(value: unknown) => {
                  if (isSortField(value)) setSortBy(value);
                }}
              >
                <ContextMenuRadioItem value='name'>
                  {t('devCommon.name')}
                </ContextMenuRadioItem>
                <ContextMenuRadioItem value='date'>
                  {t('devCommon.date')}
                </ContextMenuRadioItem>
                <ContextMenuRadioItem value='amount'>
                  {t('devCommon.amount')}
                </ContextMenuRadioItem>
              </ContextMenuRadioGroup>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
        <div className='flex flex-wrap gap-2 text-sm'>
          <Badge variant={showArchived ? 'secondary' : 'outline'}>
            {t('devComponents.contextMenu.showArchived')}
          </Badge>
          <Badge variant={showCompleted ? 'secondary' : 'outline'}>
            {t('devComponents.contextMenu.showCompleted')}
          </Badge>
          <Badge variant='outline'>
            {t('devComponents.contextMenu.sortBy')}: {t(`devCommon.${sortBy}`)}
          </Badge>
        </div>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.contextMenu.record')}
        description={t('devComponents.contextMenu.recordDescription')}
      >
        <ContextMenu>
          <ContextMenuTrigger className='flex w-full max-w-sm items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3 text-sm'>
            <div className='flex flex-col gap-0.5'>
              <span className='font-mono text-xs text-muted-foreground'>
                ORD-1042
              </span>
              <span className='font-medium'>Ava Chen</span>
            </div>
            <div className='flex items-center gap-3'>
              <Badge variant='secondary'>
                {t('devCommon.statusProcessing')}
              </Badge>
              <span className='font-medium tabular-nums'>$1,240.00</span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className='w-52'>
            <ContextMenuGroup>
              <ContextMenuLabel>ORD-1042</ContextMenuLabel>
              <ContextMenuItem
                onClick={() =>
                  setLastAction(t('devComponents.contextMenu.viewDetails'))
                }
              >
                <EyeIcon />
                {t('devComponents.contextMenu.viewDetails')}
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => setLastAction(t('devCommon.edit'))}
              >
                <PencilIcon />
                {t('devCommon.edit')}
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() =>
                  setLastAction(t('devComponents.contextMenu.duplicate'))
                }
              >
                <CopyIcon />
                {t('devComponents.contextMenu.duplicate')}
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() =>
                  setLastAction(t('devComponents.contextMenu.markShipped'))
                }
              >
                <TruckIcon />
                {t('devComponents.contextMenu.markShipped')}
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem
                variant='destructive'
                onClick={() =>
                  setLastAction(t('devComponents.contextMenu.cancelOrder'))
                }
              >
                <XCircleIcon />
                {t('devComponents.contextMenu.cancelOrder')}
              </ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
        <span className='text-sm text-muted-foreground'>
          {lastAction
            ? t('devComponents.contextMenu.lastAction', { action: lastAction })
            : t('devComponents.contextMenu.noAction')}
        </span>
      </ExampleSection>
    </ExamplePage>
  );
}

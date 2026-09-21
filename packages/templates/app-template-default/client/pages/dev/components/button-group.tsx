import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  MinusIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

import { ExamplePage, ExampleSection } from '../shared';

export default function ButtonGroupExamplePage(): ReactElement {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState(1);

  return (
    <ExamplePage
      title={t('devComponents.buttonGroup.title')}
      description={t('devComponents.buttonGroup.description')}
      source='client/pages/dev/components/button-group.tsx'
      docs='https://ui.shadcn.com/docs/components/button-group'
    >
      <ExampleSection
        title={t('devComponents.buttonGroup.basic')}
        description={t('devComponents.buttonGroup.basicDescription')}
      >
        <ButtonGroup aria-label={t('devComponents.buttonGroup.reviewActions')}>
          <Button variant='outline'>
            {t('devComponents.buttonGroup.approve')}
          </Button>
          <Button variant='outline'>
            {t('devComponents.buttonGroup.reject')}
          </Button>
          <Button variant='outline'>
            {t('devComponents.buttonGroup.reassign')}
          </Button>
        </ButtonGroup>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.buttonGroup.sizes')}
        description={t('devComponents.buttonGroup.sizesDescription')}
        contentClassName='flex-col items-start'
      >
        <ButtonGroup>
          <Button variant='outline' size='sm'>
            {t('devCommon.previous')}
          </Button>
          <Button variant='outline' size='sm'>
            {t('devCommon.next')}
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            aria-label={t('devCommon.add')}
          >
            <PlusIcon />
          </Button>
        </ButtonGroup>
        <ButtonGroup>
          <Button variant='outline'>{t('devCommon.previous')}</Button>
          <Button variant='outline'>{t('devCommon.next')}</Button>
          <Button variant='outline' size='icon' aria-label={t('devCommon.add')}>
            <PlusIcon />
          </Button>
        </ButtonGroup>
        <ButtonGroup>
          <Button variant='outline' size='lg'>
            {t('devCommon.previous')}
          </Button>
          <Button variant='outline' size='lg'>
            {t('devCommon.next')}
          </Button>
          <Button
            variant='outline'
            size='icon-lg'
            aria-label={t('devCommon.add')}
          >
            <PlusIcon />
          </Button>
        </ButtonGroup>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.buttonGroup.orientation')}
        description={t('devComponents.buttonGroup.orientationDescription')}
      >
        <ButtonGroup
          orientation='vertical'
          aria-label={t('devComponents.buttonGroup.zoomControls')}
          className='h-fit'
        >
          <Button
            variant='outline'
            size='icon'
            aria-label={t('devComponents.buttonGroup.zoomIn')}
          >
            <ZoomInIcon />
          </Button>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('devComponents.buttonGroup.zoomOut')}
          >
            <ZoomOutIcon />
          </Button>
        </ButtonGroup>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.buttonGroup.split')}
        description={t('devComponents.buttonGroup.splitDescription')}
      >
        <ButtonGroup>
          <Button>{t('devCommon.save')}</Button>
          <ButtonGroupSeparator />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size='icon'
                  aria-label={t('devComponents.buttonGroup.moreSaveOptions')}
                />
              }
            >
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  {t('devComponents.buttonGroup.saveAsDraft')}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  {t('devComponents.buttonGroup.saveAndClose')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant='destructive'>
                {t('devComponents.buttonGroup.discardChanges')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
        <ButtonGroup>
          <Button variant='secondary' size='sm'>
            {t('devCommon.copy')}
          </Button>
          <ButtonGroupSeparator />
          <Button variant='secondary' size='sm'>
            {t('devComponents.buttonGroup.paste')}
          </Button>
        </ButtonGroup>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.buttonGroup.withInput')}
        description={t('devComponents.buttonGroup.withInputDescription')}
      >
        <ButtonGroup aria-label={t('devCommon.quantity')}>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('devComponents.buttonGroup.decrease')}
            disabled={quantity <= 1}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
          >
            <MinusIcon />
          </Button>
          <Input
            value={quantity}
            readOnly
            aria-label={t('devCommon.quantity')}
            className='w-14 text-center tabular-nums'
          />
          <Button
            variant='outline'
            size='icon'
            aria-label={t('devComponents.buttonGroup.increase')}
            onClick={() => setQuantity((value) => value + 1)}
          >
            <PlusIcon />
          </Button>
        </ButtonGroup>
        <ButtonGroup>
          <ButtonGroupText>USD</ButtonGroupText>
          <Input
            placeholder='0.00'
            inputMode='decimal'
            aria-label={t('devCommon.price')}
            className='w-28'
          />
          <Button variant='outline'>{t('devCommon.apply')}</Button>
        </ButtonGroup>
        <ButtonGroup>
          <Input
            placeholder={t('devCommon.search')}
            aria-label={t('devCommon.search')}
            className='w-48'
          />
          <Button
            variant='outline'
            size='icon'
            aria-label={t('devCommon.search')}
          >
            <SearchIcon />
          </Button>
        </ButtonGroup>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.buttonGroup.nested')}
        description={t('devComponents.buttonGroup.nestedDescription')}
      >
        <ButtonGroup aria-label={t('devComponents.buttonGroup.ticketToolbar')}>
          <ButtonGroup>
            <Button
              variant='outline'
              size='icon'
              aria-label={t('devCommon.back')}
            >
              <ArrowLeftIcon />
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button variant='outline'>
              {t('devComponents.buttonGroup.approve')}
            </Button>
            <Button variant='outline'>
              {t('devComponents.buttonGroup.reject')}
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button variant='outline'>
              {t('devComponents.buttonGroup.reassign')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='outline'
                    size='icon'
                    aria-label={t('devCommon.more')}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-44'>
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    {t('devComponents.buttonGroup.markAsRead')}
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    {t('devComponents.buttonGroup.snooze')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant='destructive'>
                  {t('devCommon.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </ButtonGroup>
      </ExampleSection>
    </ExamplePage>
  );
}

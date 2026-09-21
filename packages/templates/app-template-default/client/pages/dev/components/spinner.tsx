import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';

import { ExamplePage, ExampleSection } from '../shared';

export default function SpinnerExamplePage(): ReactElement {
  const { t } = useTranslation();

  return (
    <ExamplePage
      title={t('devComponents.spinner.title')}
      description={t('devComponents.spinner.description')}
      source='client/pages/dev/components/spinner.tsx'
      docs='https://ui.shadcn.com/docs/components/spinner'
    >
      <ExampleSection
        title={t('devComponents.spinner.sizes')}
        description={t('devComponents.spinner.sizesDescription')}
      >
        <Spinner className='size-3' />
        <Spinner className='size-4' />
        <Spinner className='size-6' />
        <Spinner className='size-8' />
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.spinner.inButtons')}
        description={t('devComponents.spinner.inButtonsDescription')}
      >
        <Button disabled>
          <Spinner data-icon='inline-start' />
          {t('devComponents.spinner.saving')}
        </Button>
        <Button variant='outline' disabled>
          <Spinner data-icon='inline-start' />
          {t('devComponents.spinner.processingPayment')}
        </Button>
        <Button variant='secondary' disabled>
          {t('devComponents.spinner.uploading')}
          <Spinner data-icon='inline-end' />
        </Button>
        <Button size='icon' variant='outline' disabled>
          <Spinner />
        </Button>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.spinner.inBadges')}
        description={t('devComponents.spinner.inBadgesDescription')}
      >
        <Badge>
          <Spinner data-icon='inline-start' />
          {t('devComponents.spinner.syncing')}
        </Badge>
        <Badge variant='secondary'>
          <Spinner data-icon='inline-start' />
          {t('devComponents.spinner.updating')}
        </Badge>
        <Badge variant='outline'>
          <Spinner data-icon='inline-start' />
          {t('devCommon.statusProcessing')}
        </Badge>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.spinner.inline')}
        description={t('devComponents.spinner.inlineDescription')}
        contentClassName='block'
      >
        <div className='flex w-full max-w-sm flex-col gap-4'>
          <Item variant='muted'>
            <ItemMedia variant='icon'>
              <Spinner />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                {t('devComponents.spinner.processingPayment')}
              </ItemTitle>
              <ItemDescription>#ORD-1042 · Northwind Traders</ItemDescription>
            </ItemContent>
            <ItemContent className='flex-none justify-end'>
              <span className='text-sm tabular-nums'>$1,357.20</span>
            </ItemContent>
          </Item>
          <p className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Spinner />
            {t('devComponents.spinner.refreshingOrders')}
          </p>
        </div>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.spinner.panel')}
        description={t('devComponents.spinner.panelDescription')}
        contentClassName='block'
      >
        <div className='flex h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-sm text-muted-foreground'>
          <Spinner className='size-6' />
          <span>{t('devComponents.spinner.loadingReport')}</span>
        </div>
      </ExampleSection>
    </ExamplePage>
  );
}

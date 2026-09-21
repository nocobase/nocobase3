import { useTranslation } from '@nocobase/i18n/client';
import {
  CopyIcon,
  DownloadIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { ExamplePage, ExampleSection } from '../shared';

export default function SeparatorExamplePage(): ReactElement {
  const { t } = useTranslation();

  return (
    <ExamplePage
      title={t('devComponents.separator.title')}
      description={t('devComponents.separator.description')}
      source='client/pages/dev/components/separator.tsx'
      docs='https://ui.shadcn.com/docs/components/separator'
    >
      <ExampleSection
        title={t('devComponents.separator.horizontal')}
        description={t('devComponents.separator.horizontalDescription')}
        contentClassName='block'
      >
        <div className='flex w-full max-w-sm flex-col gap-4 text-sm'>
          <div className='flex flex-col gap-1.5'>
            <div className='leading-none font-medium'>Northwind Traders</div>
            <div className='text-muted-foreground'>
              {t('devComponents.separator.planLabel')}
            </div>
          </div>
          <Separator />
          <p>{t('devComponents.separator.accountSummary')}</p>
        </div>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.separator.vertical')}
        description={t('devComponents.separator.verticalDescription')}
      >
        <div className='flex h-5 items-center gap-4 text-sm'>
          <div>
            <span className='text-muted-foreground'>
              {t('devCommon.owner')}
            </span>{' '}
            Olivia Chen
          </div>
          <Separator orientation='vertical' />
          <div>
            <span className='text-muted-foreground'>
              {t('devCommon.updatedAt')}
            </span>{' '}
            Sep 18, 2026
          </div>
          <Separator orientation='vertical' />
          <div>
            <span className='text-muted-foreground'>
              {t('devCommon.status')}
            </span>{' '}
            {t('devCommon.statusActive')}
          </div>
        </div>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.separator.toolbar')}
        description={t('devComponents.separator.toolbarDescription')}
      >
        <div className='flex items-center gap-1 rounded-lg border bg-background p-1'>
          <Button variant='ghost' size='sm'>
            <PencilIcon data-icon='inline-start' />
            {t('devCommon.edit')}
          </Button>
          <Button variant='ghost' size='sm'>
            <CopyIcon data-icon='inline-start' />
            {t('devCommon.copy')}
          </Button>
          <Separator orientation='vertical' className='mx-1 my-1' />
          <Button variant='ghost' size='sm'>
            <Share2Icon data-icon='inline-start' />
            {t('devCommon.share')}
          </Button>
          <Button variant='ghost' size='sm'>
            <DownloadIcon data-icon='inline-start' />
            {t('devCommon.download')}
          </Button>
          <Separator orientation='vertical' className='mx-1 my-1' />
          <Button variant='ghost' size='sm' className='text-destructive'>
            <Trash2Icon data-icon='inline-start' />
            {t('devCommon.delete')}
          </Button>
        </div>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.separator.list')}
        description={t('devComponents.separator.listDescription')}
        contentClassName='block'
      >
        <div className='flex w-full max-w-sm flex-col gap-2 text-sm'>
          <dl className='flex items-center justify-between'>
            <dt>{t('devComponents.separator.subtotal')}</dt>
            <dd className='text-muted-foreground tabular-nums'>$1,240.00</dd>
          </dl>
          <Separator />
          <dl className='flex items-center justify-between'>
            <dt>{t('devComponents.separator.tax')}</dt>
            <dd className='text-muted-foreground tabular-nums'>$99.20</dd>
          </dl>
          <Separator />
          <dl className='flex items-center justify-between'>
            <dt>{t('devComponents.separator.shipping')}</dt>
            <dd className='text-muted-foreground tabular-nums'>$18.00</dd>
          </dl>
          <Separator />
          <dl className='flex items-center justify-between font-medium'>
            <dt>{t('devCommon.total')}</dt>
            <dd className='tabular-nums'>$1,357.20</dd>
          </dl>
        </div>
      </ExampleSection>
    </ExamplePage>
  );
}

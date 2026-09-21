import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  MailIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { ExamplePage, ExampleSection } from '../shared';

export default function ButtonExamplePage(): ReactElement {
  const { t } = useTranslation();

  return (
    <ExamplePage
      title={t('devComponents.button.title')}
      description={t('devComponents.button.description')}
      source='client/pages/dev/components/button.tsx'
      docs='https://ui.shadcn.com/docs/components/button'
    >
      <ExampleSection
        title={t('devComponents.button.variants')}
        description={t('devComponents.button.variantsDescription')}
      >
        <Button>{t('devCommon.save')}</Button>
        <Button variant='secondary'>{t('devCommon.cancel')}</Button>
        <Button variant='outline'>{t('devCommon.edit')}</Button>
        <Button variant='ghost'>{t('devCommon.more')}</Button>
        <Button variant='destructive'>{t('devCommon.delete')}</Button>
        <Button variant='link'>{t('devCommon.viewAll')}</Button>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.button.sizes')}
        description={t('devComponents.button.sizesDescription')}
      >
        <Button size='xs'>{t('devComponents.button.extraSmall')}</Button>
        <Button size='sm'>{t('devComponents.button.small')}</Button>
        <Button>{t('devComponents.button.default')}</Button>
        <Button size='lg'>{t('devComponents.button.large')}</Button>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.button.withIcon')}
        description={t('devComponents.button.withIconDescription')}
      >
        <Button>
          <PlusIcon data-icon='inline-start' />
          {t('devCommon.create')}
        </Button>
        <Button variant='outline'>
          <MailIcon data-icon='inline-start' />
          {t('devComponents.button.sendEmail')}
        </Button>
        <Button variant='secondary'>
          {t('devCommon.next')}
          <ArrowRightIcon data-icon='inline-end' />
        </Button>
        <Button variant='outline'>
          {t('devCommon.more')}
          <ChevronDownIcon data-icon='inline-end' />
        </Button>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.button.iconOnly')}
        description={t('devComponents.button.iconOnlyDescription')}
      >
        <Button
          size='icon-xs'
          variant='outline'
          aria-label={t('devCommon.create')}
        >
          <PlusIcon />
        </Button>
        <Button
          size='icon-sm'
          variant='outline'
          aria-label={t('devCommon.create')}
        >
          <PlusIcon />
        </Button>
        <Button
          size='icon'
          variant='outline'
          aria-label={t('devCommon.create')}
        >
          <PlusIcon />
        </Button>
        <Button
          size='icon-lg'
          variant='destructive'
          aria-label={t('devCommon.delete')}
        >
          <Trash2Icon />
        </Button>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.button.states')}
        description={t('devComponents.button.statesDescription')}
      >
        <Button disabled>{t('devCommon.save')}</Button>
        <Button disabled>
          <Spinner data-icon='inline-start' />
          {t('devCommon.loading')}
        </Button>
        <Button variant='outline' disabled>
          {t('devCommon.cancel')}
        </Button>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.button.asLink')}
        description={t('devComponents.button.asLinkDescription')}
      >
        <Button
          variant='outline'
          render={
            <a
              href='https://ui.shadcn.com/docs/components/button'
              target='_blank'
              rel='noreferrer'
            />
          }
        >
          {t('devCommon.docs')}
          <ArrowRightIcon data-icon='inline-end' />
        </Button>
      </ExampleSection>
    </ExamplePage>
  );
}

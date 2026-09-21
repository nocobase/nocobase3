import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';

import { ExamplePage, ExampleSection } from '../shared';

export default function SwitchExamplePage(): ReactElement {
  const { t } = useTranslation();
  const [published, setPublished] = useState(false);

  return (
    <ExamplePage
      title={t('devComponents.switch.title')}
      description={t('devComponents.switch.description')}
      source='client/pages/dev/components/switch.tsx'
      docs='https://ui.shadcn.com/docs/components/switch'
    >
      <ExampleSection
        title={t('devComponents.switch.basic')}
        description={t('devComponents.switch.basicDescription')}
      >
        <Field orientation='horizontal' className='w-fit'>
          <Switch id='switch-email-notifications' defaultChecked />
          <FieldLabel htmlFor='switch-email-notifications'>
            {t('devComponents.switch.emailNotifications')}
          </FieldLabel>
        </Field>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.switch.controlled')}
        description={t('devComponents.switch.controlledDescription')}
      >
        <Field orientation='horizontal' className='w-fit'>
          <Switch
            id='switch-publish'
            checked={published}
            onCheckedChange={setPublished}
          />
          <FieldLabel htmlFor='switch-publish'>
            {t('devComponents.switch.publishProduct')}
          </FieldLabel>
        </Field>
        <Badge variant={published ? 'default' : 'secondary'}>
          {published
            ? t('devCommon.statusPublished')
            : t('devCommon.statusDraft')}
        </Badge>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.switch.withDescription')}
        description={t('devComponents.switch.withDescriptionDescription')}
        contentClassName='block'
      >
        <Field orientation='horizontal' className='max-w-sm'>
          <FieldContent>
            <FieldLabel htmlFor='switch-two-factor'>
              {t('devComponents.switch.twoFactor')}
            </FieldLabel>
            <FieldDescription>
              {t('devComponents.switch.twoFactorDescription')}
            </FieldDescription>
          </FieldContent>
          <Switch id='switch-two-factor' />
        </Field>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.switch.choiceCards')}
        description={t('devComponents.switch.choiceCardsDescription')}
        contentClassName='block'
      >
        <FieldGroup className='w-full max-w-sm'>
          <FieldLabel htmlFor='switch-order-updates'>
            <Field orientation='horizontal'>
              <FieldContent>
                <FieldTitle>
                  {t('devComponents.switch.orderUpdates')}
                </FieldTitle>
                <FieldDescription>
                  {t('devComponents.switch.orderUpdatesDescription')}
                </FieldDescription>
              </FieldContent>
              <Switch id='switch-order-updates' defaultChecked />
            </Field>
          </FieldLabel>
          <FieldLabel htmlFor='switch-marketing'>
            <Field orientation='horizontal'>
              <FieldContent>
                <FieldTitle>
                  {t('devComponents.switch.marketingEmails')}
                </FieldTitle>
                <FieldDescription>
                  {t('devComponents.switch.marketingEmailsDescription')}
                </FieldDescription>
              </FieldContent>
              <Switch id='switch-marketing' />
            </Field>
          </FieldLabel>
          <FieldLabel htmlFor='switch-digest'>
            <Field orientation='horizontal'>
              <FieldContent>
                <FieldTitle>
                  {t('devComponents.switch.weeklyDigest')}
                </FieldTitle>
                <FieldDescription>
                  {t('devComponents.switch.weeklyDigestDescription')}
                </FieldDescription>
              </FieldContent>
              <Switch id='switch-digest' defaultChecked />
            </Field>
          </FieldLabel>
        </FieldGroup>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.switch.sizes')}
        description={t('devComponents.switch.sizesDescription')}
      >
        <Field orientation='horizontal' className='w-fit'>
          <Switch id='switch-size-sm' size='sm' defaultChecked />
          <FieldLabel htmlFor='switch-size-sm'>
            {t('devComponents.switch.small')}
          </FieldLabel>
        </Field>
        <Field orientation='horizontal' className='w-fit'>
          <Switch id='switch-size-default' defaultChecked />
          <FieldLabel htmlFor='switch-size-default'>
            {t('devComponents.switch.default')}
          </FieldLabel>
        </Field>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.switch.states')}
        description={t('devComponents.switch.statesDescription')}
        contentClassName='grid gap-4 sm:grid-cols-2'
      >
        <Field orientation='horizontal' data-disabled className='w-fit'>
          <Switch id='switch-disabled-off' disabled />
          <FieldLabel htmlFor='switch-disabled-off'>
            {t('devComponents.switch.disabledOff')}
          </FieldLabel>
        </Field>
        <Field orientation='horizontal' data-disabled className='w-fit'>
          <Switch id='switch-disabled-on' disabled defaultChecked />
          <FieldLabel htmlFor='switch-disabled-on'>
            {t('devComponents.switch.disabledOn')}
          </FieldLabel>
        </Field>
        <Field
          orientation='horizontal'
          data-invalid
          className='sm:col-span-2 max-w-sm'
        >
          <FieldContent>
            <FieldLabel htmlFor='switch-terms'>
              {t('devComponents.switch.acceptTerms')}
            </FieldLabel>
            <FieldDescription>
              {t('devComponents.switch.acceptTermsDescription')}
            </FieldDescription>
          </FieldContent>
          <Switch id='switch-terms' aria-invalid />
        </Field>
      </ExampleSection>
    </ExamplePage>
  );
}

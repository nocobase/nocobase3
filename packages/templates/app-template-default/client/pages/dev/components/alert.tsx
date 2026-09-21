import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  HardDriveIcon,
  InfoIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import { ExamplePage, ExampleSection } from '../shared';

export default function AlertExamplePage(): ReactElement {
  const { t } = useTranslation();

  return (
    <ExamplePage
      title={t('devComponents.alert.title')}
      description={t('devComponents.alert.description')}
      source='client/pages/dev/components/alert.tsx'
      docs='https://ui.shadcn.com/docs/components/alert'
    >
      <ExampleSection
        title={t('devComponents.alert.basic')}
        description={t('devComponents.alert.basicDescription')}
        contentClassName='grid gap-4'
      >
        <Alert className='max-w-md'>
          <CheckCircle2Icon />
          <AlertTitle>
            {t('devComponents.alert.paymentReceivedTitle')}
          </AlertTitle>
          <AlertDescription>
            {t('devComponents.alert.paymentReceivedDescription', {
              amount: '$1,240.00',
              invoice: 'INV-2031',
            })}
          </AlertDescription>
        </Alert>
        <Alert className='max-w-md'>
          <InfoIcon />
          <AlertTitle>{t('devComponents.alert.maintenanceTitle')}</AlertTitle>
          <AlertDescription>
            {t('devComponents.alert.maintenanceDescription')}
          </AlertDescription>
        </Alert>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.alert.destructive')}
        description={t('devComponents.alert.destructiveDescription')}
        contentClassName='grid gap-4'
      >
        <Alert variant='destructive' className='max-w-md'>
          <AlertCircleIcon />
          <AlertTitle>{t('devComponents.alert.paymentFailedTitle')}</AlertTitle>
          <AlertDescription>
            {t('devComponents.alert.paymentFailedDescription')}
          </AlertDescription>
        </Alert>
        <Alert variant='destructive' className='max-w-md'>
          <AlertCircleIcon />
          <AlertTitle>{t('devComponents.alert.syncStoppedTitle')}</AlertTitle>
          <AlertDescription>
            <p>{t('devComponents.alert.syncStoppedDescription')}</p>
            <ul className='list-inside list-disc text-sm'>
              <li>{t('devComponents.alert.syncStoppedReasonToken')}</li>
              <li>{t('devComponents.alert.syncStoppedReasonPermissions')}</li>
            </ul>
          </AlertDescription>
        </Alert>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.alert.withoutIcon')}
        description={t('devComponents.alert.withoutIconDescription')}
        contentClassName='grid gap-4'
      >
        <Alert className='max-w-md'>
          <AlertTitle>{t('devComponents.alert.titleOnly')}</AlertTitle>
        </Alert>
        <Alert className='max-w-md'>
          <AlertDescription>
            {t('devComponents.alert.descriptionOnly')}
          </AlertDescription>
        </Alert>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.alert.withAction')}
        description={t('devComponents.alert.withActionDescription')}
        contentClassName='grid gap-4'
      >
        <Alert className='max-w-md'>
          <HardDriveIcon />
          <AlertTitle>
            {t('devComponents.alert.storageTitle', { percent: '92%' })}
          </AlertTitle>
          <AlertDescription>
            {t('devComponents.alert.storageDescription')}
          </AlertDescription>
          <AlertAction>
            <Button size='xs'>{t('devComponents.alert.manageStorage')}</Button>
          </AlertAction>
        </Alert>
        <Alert className='max-w-md'>
          <DownloadIcon />
          <AlertTitle>{t('devComponents.alert.exportReadyTitle')}</AlertTitle>
          <AlertDescription>
            {t('devComponents.alert.exportReadyDescription', {
              file: 'customers-2026-09.csv',
            })}
          </AlertDescription>
          <AlertAction>
            <Button size='xs' variant='outline'>
              {t('devCommon.download')}
            </Button>
          </AlertAction>
        </Alert>
        <Alert variant='destructive' className='max-w-md'>
          <AlertCircleIcon />
          <AlertTitle>{t('devComponents.alert.webhookFailedTitle')}</AlertTitle>
          <AlertDescription>
            {t('devComponents.alert.webhookFailedDescription')}
          </AlertDescription>
          <AlertAction>
            <Button size='xs' variant='outline'>
              {t('devComponents.alert.retry')}
            </Button>
          </AlertAction>
        </Alert>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.alert.inForm')}
        description={t('devComponents.alert.inFormDescription')}
        contentClassName='block'
      >
        <Card className='w-full max-w-md'>
          <CardHeader>
            <CardTitle>{t('devComponents.alert.formTitle')}</CardTitle>
            <CardDescription>
              {t('devComponents.alert.formDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Alert variant='destructive'>
              <AlertCircleIcon />
              <AlertTitle>{t('devComponents.alert.formErrorTitle')}</AlertTitle>
              <AlertDescription>
                {t('devComponents.alert.formErrorDescription')}
              </AlertDescription>
            </Alert>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor='alert-form-name'>
                  {t('devCommon.name')}
                </FieldLabel>
                <Input id='alert-form-name' defaultValue='Acme Inc.' />
              </Field>
              <Field data-invalid>
                <FieldLabel htmlFor='alert-form-email'>
                  {t('devCommon.email')}
                </FieldLabel>
                <Input
                  id='alert-form-email'
                  type='email'
                  defaultValue='billing@acme'
                  aria-invalid
                />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className='justify-end gap-2'>
            <Button variant='outline'>{t('devCommon.cancel')}</Button>
            <Button>{t('devCommon.save')}</Button>
          </CardFooter>
        </Card>
      </ExampleSection>
    </ExamplePage>
  );
}

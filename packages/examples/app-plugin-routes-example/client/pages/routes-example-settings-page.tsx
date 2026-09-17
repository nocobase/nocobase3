import { useTranslation as useDemoTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '../components/page-container.js';
import { PageHeader } from '../components/page-header.js';
import { useRoutesExample } from '../contexts/routes-example-context.js';

export default function RoutesExampleSettingsPage(): ReactElement {
  const { t: translateDemo } = useDemoTranslation(
    '@nocobase/app-plugin-routes-example',
  );

  const { description } = useRoutesExample();

  return (
    <PageContainer>
      <PageHeader
        title={translateDemo('Routes example', {
          defaultValue: 'Routes example',
        })}
        description={translateDemo(description, { defaultValue: description })}
      />

      <dl className='space-y-4 rounded-xl border p-6'>
        <div>
          <dt className='text-sm text-muted-foreground'>
            {translateDemo('App route', { defaultValue: 'App route' })}
          </dt>
          <dd className='font-mono text-sm'>/routes-example</dd>
        </div>
        <div>
          <dt className='text-sm text-muted-foreground'>
            {translateDemo('API route', { defaultValue: 'API route' })}
          </dt>
          <dd className='font-mono text-sm'>/api/routes-example</dd>
        </div>
        <div>
          <dt className='text-sm text-muted-foreground'>
            {translateDemo('Root route', { defaultValue: 'Root route' })}
          </dt>
          <dd className='font-mono text-sm'>/routes-example/root</dd>
        </div>
      </dl>
    </PageContainer>
  );
}

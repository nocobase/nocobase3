import type { ReactElement } from 'react';

import { PageContainer } from '../components/page-container.js';
import { PageHeader } from '../components/page-header.js';
import { useRoutesExample } from '../contexts/routes-example-context.js';

export default function RoutesExampleSettingsPage(): ReactElement {
  const { description } = useRoutesExample();

  return (
    <PageContainer>
      <PageHeader title='Routes example' description={description} />

      <dl className='space-y-4 rounded-xl border p-6'>
        <div>
          <dt className='text-sm text-muted-foreground'>App route</dt>
          <dd className='font-mono text-sm'>/routes-example</dd>
        </div>
        <div>
          <dt className='text-sm text-muted-foreground'>API route</dt>
          <dd className='font-mono text-sm'>/api/routes-example</dd>
        </div>
        <div>
          <dt className='text-sm text-muted-foreground'>Root route</dt>
          <dd className='font-mono text-sm'>/routes-example/root</dd>
        </div>
      </dl>
    </PageContainer>
  );
}

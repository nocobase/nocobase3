import type { ReactElement } from 'react';

import { useRoutesExample } from '../contexts/routes-example-context.js';

export default function RoutesExampleSettingsPage(): ReactElement {
  const { description } = useRoutesExample();

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10'>
      <header className='space-y-2 border-b pb-6'>
        <p className='text-sm text-muted-foreground'>Settings route example</p>
        <h1 className='text-2xl font-semibold'>Routes example</h1>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </header>

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
    </section>
  );
}

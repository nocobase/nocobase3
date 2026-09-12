import type { ReactElement } from 'react';

import { useRoutesExample } from '../contexts/routes-example-context.js';

/**
 * A dev-only page. It is reachable at `/dev/routes-example` while developing and is absent from a production build,
 * along with this module, because `defineDevRoutes()` drops its routes when `import.meta.env.PROD` is true.
 */
export default function RoutesExampleDevPage(): ReactElement {
  const { description } = useRoutesExample();

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10'>
      <header className='space-y-2 border-b pb-6'>
        <p className='text-sm text-muted-foreground'>Dev route example</p>
        <h1 className='text-2xl font-semibold'>Routes example dev tools</h1>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </header>

      <dl className='space-y-4 rounded-xl border p-6'>
        <div>
          <dt className='text-sm text-muted-foreground'>Dev route</dt>
          <dd className='font-mono text-sm'>/dev/routes-example</dd>
        </div>
        <div>
          <dt className='text-sm text-muted-foreground'>Available in</dt>
          <dd className='text-sm'>Development builds only</dd>
        </div>
      </dl>
    </section>
  );
}

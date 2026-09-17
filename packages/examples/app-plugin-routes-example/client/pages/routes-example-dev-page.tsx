import { useTranslation as useDemoTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { useRoutesExample } from '../contexts/routes-example-context.js';

/**
 * A dev-only page. It is reachable at `/dev/routes-example` while developing and is absent from a production build,
 * along with this module, because `defineDevRoutes()` drops its routes when `import.meta.env.PROD` is true.
 */
export default function RoutesExampleDevPage(): ReactElement {
  const { t: translateDemo } = useDemoTranslation(
    '@nocobase/app-plugin-routes-example',
  );

  const { description } = useRoutesExample();

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10'>
      <header className='space-y-2 border-b pb-6'>
        <p className='text-sm text-muted-foreground'>
          {translateDemo('Dev route example', {
            defaultValue: 'Dev route example',
          })}
        </p>
        <h1 className='text-2xl font-semibold'>
          {translateDemo('Routes example dev tools', {
            defaultValue: 'Routes example dev tools',
          })}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {translateDemo(description, { defaultValue: description })}
        </p>
      </header>

      <dl className='space-y-4 rounded-xl border p-6'>
        <div>
          <dt className='text-sm text-muted-foreground'>
            {translateDemo('Dev route', { defaultValue: 'Dev route' })}
          </dt>
          <dd className='font-mono text-sm'>/dev/routes-example</dd>
        </div>
        <div>
          <dt className='text-sm text-muted-foreground'>
            {translateDemo('Available in', { defaultValue: 'Available in' })}
          </dt>
          <dd className='text-sm'>
            {translateDemo('Development builds only', {
              defaultValue: 'Development builds only',
            })}
          </dd>
        </div>
      </dl>
    </section>
  );
}

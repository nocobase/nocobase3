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
          {translateDemo('devExample', {
            defaultValue: 'Dev route example',
          })}
        </p>
        <h1 className='text-2xl font-semibold'>
          {translateDemo('devTitle', {
            defaultValue: 'Routes example dev tools',
          })}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {translateDemo(
            description ===
              'This page uses a provider contributed by the same client plugin.'
              ? 'providerDescription'
              : description,
            { defaultValue: description },
          )}
        </p>
      </header>

      <dl className='space-y-4 rounded-xl border p-6'>
        <div>
          <dt className='text-sm text-muted-foreground'>
            {translateDemo('devRoute', { defaultValue: 'Dev route' })}
          </dt>
          <dd className='font-mono text-sm'>/dev/routes-example</dd>
        </div>
        <div>
          <dt className='text-sm text-muted-foreground'>
            {translateDemo('availableIn', { defaultValue: 'Available in' })}
          </dt>
          <dd className='text-sm'>
            {translateDemo('developmentOnly', {
              defaultValue: 'Development builds only',
            })}
          </dd>
        </div>
      </dl>
    </section>
  );
}

import { Button } from '@nocobase/app-client/ui';
import { useGetIdentity, useLogout } from '@refinedev/core';
import type { ReactElement } from 'react';

interface AppIdentity {
  email?: string;
  fullName?: string;
  id: string | number;
}

export function HomePage(): ReactElement {
  const { data: identity } = useGetIdentity<AppIdentity>();
  const { mutate: logout, isPending } = useLogout();

  return (
    <main className='mx-auto flex min-h-svh w-full max-w-5xl flex-col px-6 py-10'>
      <header className='flex items-center justify-between border-b pb-6'>
        <div>
          <p className='text-sm text-muted-foreground'>NocoBase application</p>
          <h1 className='text-xl font-semibold'>Default App</h1>
        </div>
        <Button variant='outline' disabled={isPending} onClick={() => logout()}>
          {isPending ? 'Signing out…' : 'Sign out'}
        </Button>
      </header>

      <section className='grid flex-1 place-items-center py-16'>
        <div className='max-w-xl space-y-3 text-center'>
          <h2 className='text-3xl font-semibold tracking-tight'>
            App client is ready
          </h2>
          <p className='text-muted-foreground'>
            {identity?.fullName || identity?.email
              ? `Signed in as ${identity.fullName ?? identity.email}. `
              : ''}
            Application routes and pages now live in this package, while the
            shared React and Refine runtime lives in @nocobase/app-client.
          </p>
        </div>
      </section>
    </main>
  );
}

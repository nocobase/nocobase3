import { useGetIdentity } from '@refinedev/core';
import type { ReactElement } from 'react';

interface AppIdentity {
  email?: string;
  fullName?: string;
  id: string | number;
}

export default function HomePage(): ReactElement {
  const { data: identity } = useGetIdentity<AppIdentity>();

  return (
    <section className='mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-5xl place-items-center px-6 py-10'>
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
  );
}

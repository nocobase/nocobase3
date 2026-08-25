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
          Start building with your AI Agent
        </h2>
        <p className='text-muted-foreground'>
          {identity?.fullName || identity?.email
            ? `Welcome, ${identity.fullName ?? identity.email}. `
            : ''}
          Describe what you need, and your AI Agent will help you build it.
        </p>
      </div>
    </section>
  );
}

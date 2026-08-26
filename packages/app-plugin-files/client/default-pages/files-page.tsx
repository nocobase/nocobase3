import type { ReactElement } from 'react';

import { Badge } from '../components/ui/badge.js';

interface CapabilityStatus {
  readonly description: string;
  readonly name: string;
  readonly scope: string;
}

const CAPABILITIES: readonly CapabilityStatus[] = Object.freeze([
  {
    name: 'Managed storage',
    description: 'Private Local and S3-compatible object storage.',
    scope: 'Application configured',
  },
  {
    name: 'Scoped access',
    description: 'Record-bound routes keep authorization with business data.',
    scope: 'Server enforced',
  },
  {
    name: 'Upload lifecycle',
    description: 'Explicit completion and bounded temporary-file cleanup.',
    scope: 'Runtime managed',
  },
]);

export default function FilesPage(): ReactElement {
  return (
    <main className='mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10'>
      <header className='flex flex-col gap-4 border-b pb-7 sm:flex-row sm:items-start sm:justify-between'>
        <div className='max-w-2xl space-y-2'>
          <p className='text-sm font-medium text-muted-foreground'>
            Application capability
          </p>
          <h1 className='text-2xl font-semibold'>Files</h1>
          <p className='text-sm leading-6 text-muted-foreground'>
            Managed file storage is available to application features through
            scoped routes and stable client upload contracts.
          </p>
        </div>
        <Badge role='status'>Runtime enabled</Badge>
      </header>

      <section
        aria-labelledby='files-capabilities-heading'
        className='space-y-4'
      >
        <div className='space-y-1'>
          <h2
            className='text-base font-semibold'
            id='files-capabilities-heading'
          >
            Capability status
          </h2>
          <p className='text-sm text-muted-foreground'>
            Files stay attached to the business records that own them.
          </p>
        </div>

        <dl className='grid gap-3 md:grid-cols-3'>
          {CAPABILITIES.map((capability) => (
            <div
              className='rounded-lg border bg-card p-5 text-card-foreground'
              key={capability.name}
            >
              <div className='flex items-start justify-between gap-3'>
                <dt className='font-medium'>{capability.name}</dt>
                <span className='text-xs text-muted-foreground'>Available</span>
              </div>
              <dd className='mt-3 space-y-3'>
                <p className='text-sm leading-6 text-muted-foreground'>
                  {capability.description}
                </p>
                <p className='border-t pt-3 text-xs font-medium text-muted-foreground'>
                  {capability.scope}
                </p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby='files-ui-heading'
        className='rounded-lg border bg-muted/30 p-5'
      >
        <h2 className='text-sm font-semibold' id='files-ui-heading'>
          Application UI
        </h2>
        <p className='mt-2 max-w-3xl text-sm leading-6 text-muted-foreground'>
          Upload and preview controls are installed as application-owned source
          when a form needs them. The Files runtime and this status page remain
          available without installing a Registry item.
        </p>
      </section>
    </main>
  );
}

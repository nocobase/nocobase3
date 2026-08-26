import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  FilesUiProvider,
  useFilesUi,
} from '@/extensions/nocobase-files-provider-ui';

interface FilesCapability {
  readonly detail: string;
  readonly name: string;
  readonly status: string;
}

const CAPABILITIES: readonly FilesCapability[] = Object.freeze([
  {
    name: 'Storage',
    detail: 'Private Local or S3-compatible object storage.',
    status: 'Configured by the application',
  },
  {
    name: 'Scoped routes',
    detail: 'Business records retain authorization and file ownership.',
    status: 'Server enforced',
  },
  {
    name: 'Editable UI',
    detail: 'Upload and preview controls are application-owned source.',
    status: 'Registry installed',
  },
]);

export default function FilesPage(): ReactElement {
  return (
    <FilesUiProvider>
      <FilesPageContent />
    </FilesUiProvider>
  );
}

function FilesPageContent(): ReactElement {
  const { buildFileUrl } = useFilesUi();
  const [showDetails, setShowDetails] = useState(false);

  return (
    <main className='mx-auto flex w-full max-w-5xl flex-col gap-7 px-6 py-10'>
      <header className='flex flex-col gap-4 border-b pb-7 sm:flex-row sm:items-start sm:justify-between'>
        <div className='max-w-2xl space-y-2'>
          <p className='text-sm font-medium text-muted-foreground'>
            Application-owned page
          </p>
          <h1 className='text-2xl font-semibold'>Files</h1>
          <p className='text-sm leading-6 text-muted-foreground'>
            Managed uploads stay attached to the business records that own them.
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          onClick={() => setShowDetails((current) => !current)}
        >
          {showDetails ? 'Hide details' : 'View details'}
        </Button>
      </header>

      <section aria-labelledby='files-status-heading' className='space-y-4'>
        <h2 id='files-status-heading' className='text-base font-semibold'>
          Capability status
        </h2>
        <dl className='grid gap-3 md:grid-cols-3'>
          {CAPABILITIES.map((capability) => (
            <div
              key={capability.name}
              className='rounded-lg border bg-card p-5 text-card-foreground'
            >
              <dt className='font-medium'>{capability.name}</dt>
              <dd className='mt-3 text-sm leading-6 text-muted-foreground'>
                {capability.detail}
              </dd>
              {showDetails ? (
                <dd className='mt-3 border-t pt-3 text-xs font-medium text-muted-foreground'>
                  {capability.name === 'Storage'
                    ? buildFileUrl('')
                    : capability.status}
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}

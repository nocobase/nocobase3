import { LoaderCircle } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { useAuthorizationTranslation } from '../i18n.js';
import { Button } from './ui/button.js';
import { Card } from './ui/card.js';

/** The chrome every Authorization settings page renders inside. */
export function PermissionsPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}): ReactElement {
  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20 p-5 sm:p-8'>
      <div className='min-w-0 space-y-5'>
        <header className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
          <div className='min-w-0'>
            <h1 className='font-heading text-3xl font-semibold tracking-[-0.035em]'>
              {title}
            </h1>
            <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
              {description}
            </p>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

export function PageLoading(): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <Card className='grid min-h-64 place-items-center'>
      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
        <LoaderCircle className='size-4 animate-spin' />
        {t('common.loading')}
      </div>
    </Card>
  );
}

export function PageError({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <Card className='grid min-h-64 place-items-center p-6 text-center'>
      <div className='space-y-3'>
        <p className='text-sm text-muted-foreground'>
          {message ?? t('page.loadFailed')}
        </p>
        <Button onClick={onRetry} variant='outline'>
          {t('common.retry')}
        </Button>
      </div>
    </Card>
  );
}

/** The refusal the page itself produces, in the same card shape as an error. */
export function PageForbidden({ message }: { message: string }): ReactElement {
  return (
    <Card className='grid min-h-64 place-items-center p-6 text-center'>
      <p className='max-w-prose text-sm text-muted-foreground'>{message}</p>
    </Card>
  );
}

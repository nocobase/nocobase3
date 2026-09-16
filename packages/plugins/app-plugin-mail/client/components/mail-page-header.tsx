import type { ReactElement, ReactNode } from 'react';

export interface MailPageHeaderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
}

export function MailPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: MailPageHeaderProps): ReactElement {
  return (
    <header className='border-b bg-background px-6 py-7'>
      <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
            {eyebrow}
          </p>
          <h1 className='mt-1 text-2xl font-semibold tracking-tight'>
            {title}
          </h1>
          <p className='mt-1 max-w-3xl text-sm text-muted-foreground'>
            {description}
          </p>
        </div>
        {actions ? <div className='flex flex-wrap gap-2'>{actions}</div> : null}
      </div>
    </header>
  );
}

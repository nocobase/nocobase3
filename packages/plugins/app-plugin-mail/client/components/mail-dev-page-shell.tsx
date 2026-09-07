import type { ReactElement, ReactNode } from 'react';

export interface MailDevPageShellProps {
  readonly actions?: ReactNode;
  readonly badge: string;
  readonly category: string;
  readonly children: ReactNode;
  readonly description: string;
  readonly title: string;
}

export function MailDevPageShell({
  actions,
  badge,
  category,
  children,
  description,
  title,
}: MailDevPageShellProps): ReactElement {
  return (
    <main
      className='@container/main mx-auto flex min-h-full w-full flex-col px-4 py-5 md:p-6 lg:px-8 lg:py-7'
      style={{ maxWidth: '1600px' }}
    >
      <header className='mb-8 flex flex-wrap items-start justify-between gap-5 border-b pb-8'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='inline-flex h-5 items-center rounded-full bg-secondary px-2 text-xs font-medium text-secondary-foreground'>
              {badge}
            </span>
            <span className='inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium text-foreground'>
              {category}
            </span>
          </div>
          <h1 className='mt-4 text-3xl font-semibold tracking-[-0.035em]'>
            {title}
          </h1>
          <p className='mt-3 max-w-3xl text-sm leading-6 text-muted-foreground'>
            {description}
          </p>
        </div>
        {actions ? <div className='flex flex-wrap gap-2'>{actions}</div> : null}
      </header>
      <div className='min-w-0 flex-1'>{children}</div>
    </main>
  );
}

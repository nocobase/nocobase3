import type { ReactElement, ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly description?: ReactNode;
  readonly back?: ReactNode;
  readonly actions?: ReactNode;
  readonly navigation?: ReactNode;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  back,
  actions,
  navigation,
}: PageHeaderProps): ReactElement {
  return (
    <header className='border-b bg-background'>
      <div className='mx-auto w-full max-w-7xl px-6'>
        <div className='py-7'>
          {back ? (
            <div className='mb-4 text-sm text-muted-foreground'>{back}</div>
          ) : null}
          <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
            <div className='min-w-0'>
              {eyebrow ? (
                <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                  {eyebrow}
                </p>
              ) : null}
              <h1 className='mt-1 text-2xl font-semibold tracking-tight'>
                {title}
              </h1>
              {description ? (
                <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className='flex shrink-0 items-center gap-2'>{actions}</div>
            ) : null}
          </div>
        </div>
        {navigation ?? null}
      </div>
    </header>
  );
}

import type { PropsWithChildren, ReactElement, ReactNode } from 'react';

export interface DefaultAuthLayoutProps extends PropsWithChildren {
  readonly description: string;
  readonly footer?: ReactNode;
  readonly title: string;
}

export function DefaultAuthLayout({
  children,
  description,
  footer,
  title,
}: DefaultAuthLayoutProps): ReactElement {
  return (
    <main className='grid min-h-svh place-items-center bg-background px-6 py-10 text-foreground'>
      <section className='w-full max-w-sm rounded-xl border bg-card p-8 text-card-foreground shadow-sm'>
        <header className='mb-8'>
          <p className='mb-8 text-lg font-semibold'>NocoBase</p>
          <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
          <p className='mt-2 text-sm text-muted-foreground'>{description}</p>
        </header>
        {children}
        {footer ? <footer className='mt-8 text-sm'>{footer}</footer> : null}
      </section>
    </main>
  );
}

import type { PropsWithChildren, ReactElement, ReactNode } from 'react';

import { AuthBrand } from './auth-brand';
import { AuthMarketingPanel } from './auth-marketing-panel';

export interface AuthLayoutProps extends PropsWithChildren {
  readonly description: string;
  readonly footer?: ReactNode;
  readonly title: string;
}

export function AuthLayout({
  children,
  description,
  footer,
  title,
}: AuthLayoutProps): ReactElement {
  return (
    <div className='grid min-h-svh bg-background text-foreground md:grid-cols-[minmax(420px,44%)_1fr]'>
      <main className='grid place-items-center bg-card px-6 py-10 text-card-foreground sm:px-12'>
        <section className='w-full max-w-sm'>
          <div className='mb-14'>
            <AuthBrand />
          </div>
          <header className='mb-8'>
            <h1 className='text-3xl font-semibold tracking-[-0.035em]'>
              {title}
            </h1>
            <p className='mt-2 text-sm text-muted-foreground'>{description}</p>
          </header>
          {children}
          {footer ? <footer className='mt-8 text-sm'>{footer}</footer> : null}
        </section>
      </main>
      <AuthMarketingPanel />
    </div>
  );
}

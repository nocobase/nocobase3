import { useTranslate } from '@refinedev/core';
import type { PropsWithChildren, ReactNode } from 'react';
import { Blocks, ShieldCheck, Sparkles } from 'lucide-react';

import { Brand } from '@/components/app-shell/brand';

type AuthLayoutProps = PropsWithChildren<{
  title: string;
  description: string;
  footer?: ReactNode;
}>;

export function AuthLayout({
  title,
  description,
  footer,
  children,
}: AuthLayoutProps) {
  const translate = useTranslate();

  return (
    <div className='grid min-h-svh bg-background lg:grid-cols-[minmax(420px,44%)_1fr]'>
      <main className='grid place-items-center bg-card px-6 py-10 sm:px-10 lg:px-12'>
        <div className='w-full max-w-sm'>
          <Brand className='mb-10 sm:mb-14' logoClassName='h-9 sm:h-10' />
          <h1 className='text-2xl font-semibold tracking-[-0.035em] sm:text-3xl'>
            {title}
          </h1>
          <p className='mb-8 mt-2 text-sm text-muted-foreground'>
            {description}
          </p>
          {children}
          {footer && <div className='mt-8 text-sm'>{footer}</div>}
        </div>
      </main>

      <section className='relative hidden overflow-hidden bg-foreground p-8 text-background lg:grid lg:place-items-center xl:p-12'>
        <div className='absolute inset-0 opacity-[0.08] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:48px_48px]' />
        <div className='relative w-full max-w-xl'>
          <div className='text-xs font-semibold uppercase tracking-[0.14em] text-background/60'>
            {translate(
              'auth.marketing.eyebrow',
              'AI-native application platform',
            )}
          </div>
          <h2 className='mt-3 max-w-lg text-4xl leading-[1.08] font-semibold tracking-[-0.04em] xl:text-5xl'>
            {translate(
              'auth.marketing.title',
              'Let AI build freely. NocoBase keeps it reliable.',
            )}
          </h2>
          <p className='mt-5 max-w-lg text-base leading-7 text-background/60'>
            {translate(
              'auth.marketing.description',
              'Give AI a flexible frontend framework to shape each experience, while NocoBase secures the data, permissions, workflows and governance underneath.',
            )}
          </p>

          <div className='mt-10 max-w-md rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl'>
            <div className='flex items-center gap-3'>
              <div className='grid size-10 place-items-center rounded-lg bg-muted'>
                <Sparkles className='size-4' />
              </div>
              <div>
                <div className='font-semibold'>
                  {translate(
                    'auth.marketing.aiFrontend.title',
                    'AI-native frontend',
                  )}
                </div>
                <div className='text-sm text-muted-foreground'>
                  {translate(
                    'auth.marketing.aiFrontend.description',
                    'Compose interfaces freely on a flexible framework.',
                  )}
                </div>
              </div>
            </div>
            <div className='my-5 h-px bg-border' />
            <div className='flex items-center gap-3'>
              <div className='grid size-10 place-items-center rounded-lg bg-muted'>
                <ShieldCheck className='size-4' />
              </div>
              <div>
                <div className='font-semibold'>
                  {translate(
                    'auth.marketing.foundation.title',
                    'NocoBase foundation',
                  )}
                </div>
                <div className='text-sm text-muted-foreground'>
                  {translate(
                    'auth.marketing.foundation.description',
                    'Reliable data, access control, workflows and governance.',
                  )}
                </div>
              </div>
            </div>
            <div className='mt-5 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-muted-foreground'>
              <Blocks className='size-3.5' />
              {translate(
                'auth.marketing.summary',
                'Freedom above. Confidence below.',
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

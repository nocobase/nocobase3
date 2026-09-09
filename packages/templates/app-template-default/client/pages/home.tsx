import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <section className='mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-5xl place-items-center px-6 py-10'>
      <div className='max-w-xl space-y-6 text-center'>
        <h1 className='font-heading text-3xl font-semibold tracking-tight'>
          {t('home.title')}
        </h1>
        <p className='text-muted-foreground'>{t('home.description')}</p>
      </div>
    </section>
  );
}

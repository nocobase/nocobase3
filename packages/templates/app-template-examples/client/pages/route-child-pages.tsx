import { useTranslation } from '@nocobase/i18n/client';
import { ArrowRight, FileStack } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

import { useChildPageActive } from '../routing/route-context.js';
import { routeChildPageRecords } from './route-child-page-records.js';

export default function RouteChildPagesPage() {
  const { t } = useTranslation();
  // A child page replaces this one; an overlay would not, and this page would keep rendering underneath it.
  const childPageActive = useChildPageActive();

  if (childPageActive) return <Outlet />;

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 p-6 md:p-8'>
      <Breadcrumbs />
      <PageHeader
        description={t('routeOverlays.childPagesDescription')}
        title={t('routeOverlays.childPagesTitle')}
      />
      <ul className='grid gap-3 sm:grid-cols-3'>
        {routeChildPageRecords.map((record) => (
          <li
            className='flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md'
            key={record.id}
          >
            <div className='flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary'>
              <FileStack className='size-5' />
            </div>
            <h2 className='mt-5 font-heading text-lg font-semibold'>
              {t(record.name)}
            </h2>
            <p className='mt-2 flex-1 text-sm leading-6 text-muted-foreground'>
              {t(record.summary)}
            </p>
            <Button
              className='mt-5 self-start'
              nativeButton={false}
              render={<Link to={record.id} />}
              size='sm'
              variant='outline'
            >
              {t('routeOverlays.openRecord')}
              <ArrowRight />
            </Button>
          </li>
        ))}
      </ul>
      {/* This page owns its child routes, so it places the outlet itself. */}
      <Outlet />
    </section>
  );
}

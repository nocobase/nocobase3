import { useTranslation } from '@nocobase/i18n/client';
import { Layers3, MessageSquare } from 'lucide-react';
import { Link, Outlet, useParams } from 'react-router';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

import { usePageTitle } from '../routing/route-context.js';
import { findRouteChildPageRecord } from './route-child-page-records.js';

export default function RouteChildPageDetailPage() {
  const { t } = useTranslation();
  const { recordId } = useParams();
  const record = findRouteChildPageRecord(recordId);
  const title = record ? t(record.name) : undefined;

  // The route cannot know this name, so the page reports it. A real page would do the same once its request
  // resolves; until then the route's declared title holds the level and the trail does not change height.
  usePageTitle(title);

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 p-6 md:p-8'>
      <Breadcrumbs />
      <PageHeader
        actions={
          <Button
            nativeButton={false}
            render={<Link to='dialog' />}
            variant='outline'
          >
            <MessageSquare />
            {t('routeOverlays.openRecordDialog')}
          </Button>
        }
        description={
          record ? t(record.summary) : t('routeOverlays.recordMissing')
        }
        title={title ?? t('routeOverlays.recordMissingTitle')}
      />
      <section className='rounded-xl border bg-muted/30 p-5 md:p-6'>
        <div className='flex items-start gap-3'>
          <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'>
            <Layers3 className='size-4' />
          </div>
          <p className='text-sm leading-6 text-muted-foreground'>
            {t('routeOverlays.childPageDetailHint')}
          </p>
        </div>
      </section>
      {/* The dialog below is a child route of this page, so this page places the outlet. */}
      <Outlet />
    </section>
  );
}

import { useTranslation } from '@nocobase/i18n/client';
import { Plus, Sparkles } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';

export default function RouteOverlaysPage() {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <section className='w-full space-y-6 p-6 md:p-8'>
      <Breadcrumbs />
      <PageHeader
        actions={
          <>
            <Button variant='outline'>
              <Sparkles />
              {t('routeOverlays.preview')}
            </Button>
            <Button>
              <Plus />
              {t('routeOverlays.newExample')}
            </Button>
          </>
        }
        description={t('routeOverlays.description')}
        title={t('routeOverlays.title')}
      />
      <div className='flex flex-wrap gap-3'>
        <Button
          render={<Link to={{ pathname: 'dialog', search: location.search }} />}
          nativeButton={false}
        >
          {t('routeOverlays.openDialog')}
        </Button>
        <Button
          render={<Link to={{ pathname: 'drawer', search: location.search }} />}
          nativeButton={false}
          variant='outline'
        >
          {t('routeOverlays.openDrawer')}
        </Button>
      </div>
      <Outlet />
    </section>
  );
}

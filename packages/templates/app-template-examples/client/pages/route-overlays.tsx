import { useTranslation } from '@nocobase/i18n/client';
import { Link, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';

export default function RouteOverlaysPage() {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 p-6 md:p-8'>
      <h1 className='font-heading text-3xl font-semibold'>
        {t('routeOverlays.title')}
      </h1>
      <p className='text-sm text-muted-foreground'>
        {t('routeOverlays.description')}
      </p>
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

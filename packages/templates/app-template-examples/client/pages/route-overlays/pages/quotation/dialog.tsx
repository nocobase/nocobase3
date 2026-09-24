import { useTranslation } from '@nocobase/i18n/client';
import { RouteDialog } from '@/extensions/nocobase-route-overlay-ui/components/route-dialog';
import { useRouteOverlay } from '@/extensions/nocobase-route-overlay-ui/hooks/use-route-overlay';
import { Button } from '@/components/ui/button';

function CloseAction() {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      disabled={isClosing}
      onClick={() => {
        void close().catch((error: unknown) => {
          console.error('Failed to close route overlay', error);
        });
      }}
    >
      {t('actions.close')}
    </Button>
  );
}

export default function RouteChildPageDialogPage() {
  const { t } = useTranslation();

  return (
    <RouteDialog
      description={t('routeOverlays.topicDialogDescription')}
      footer={<CloseAction />}
      title={t('routeOverlays.topicDialogTitle')}
    >
      <p className='text-sm leading-6 text-muted-foreground'>
        {t('routeOverlays.topicDialogHint')}
      </p>
    </RouteDialog>
  );
}

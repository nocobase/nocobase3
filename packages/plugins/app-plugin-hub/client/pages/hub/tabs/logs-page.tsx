import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { useHubAppPage } from '../app-page.js';
import { LogViewer } from '../log-viewer.js';
export default function LogsPage(): ReactElement {
  const { app } = useHubAppPage();
  const { t } = useTranslation('@nocobase/app-plugin-hub');
  return (
    <div className='space-y-4'>
      <h2 className='font-semibold'>{t('logs.title')}</h2>
      {app.runtime.state === 'stopped' && (
        <p className='text-sm text-muted-foreground'>{t('logs.stopped')}</p>
      )}
      <LogViewer appId={app.app.id} />
    </div>
  );
}

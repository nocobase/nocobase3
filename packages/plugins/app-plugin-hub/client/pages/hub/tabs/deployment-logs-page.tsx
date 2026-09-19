import type { ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { AppDialog } from '../shared.js';
import { LogViewer } from '../log-viewer.js';
export default function DeploymentLogsPage(): ReactElement {
  const { appId = '', deploymentId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('@nocobase/app-plugin-hub');
  return (
    <AppDialog
      wide
      title={t('logs.deployment')}
      description={deploymentId}
      onClose={() => {
        void navigate('..', { relative: 'route' });
      }}
    >
      <LogViewer appId={appId} deploymentId={deploymentId} />
    </AppDialog>
  );
}

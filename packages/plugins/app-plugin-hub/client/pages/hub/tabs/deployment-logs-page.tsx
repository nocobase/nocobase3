import type { ReactElement } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useResolvedPath,
} from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { AppDialog } from '../shared.js';
import { useHubAppPage } from '../app-page.js';
import { LogViewer } from '../log-viewer.js';
export default function DeploymentLogsPage(): ReactElement {
  const { appId = '', deploymentId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const parent = useResolvedPath('..');
  const { app } = useHubAppPage();
  const deployment = app.deployments.find((item) => item.id === deploymentId);
  const { t } = useTranslation('@nocobase/app-plugin-hub');
  return (
    <AppDialog
      contentClassName='top-0 right-0 left-auto h-svh max-h-svh w-full max-w-3xl translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 p-6'
      title={t('logs.deployment')}
      description={`${deployment?.release ? `v${deployment.release.version} · ` : ''}#${deploymentId}`}
      onClose={() => {
        void navigate({ pathname: parent.pathname, search: location.search });
      }}
    >
      <LogViewer key={deploymentId} appId={appId} deploymentId={deploymentId} />
    </AppDialog>
  );
}

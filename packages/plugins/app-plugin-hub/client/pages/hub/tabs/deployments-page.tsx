import { Outlet } from 'react-router';
import { useEffect, useRef, type ReactElement } from 'react';
import { Deployments } from '../deployments.js';
import { Releases } from '../releases.js';
import { AppTabLoading, useHubAppPage } from '../app-page.js';

export default function DeploymentsPage(): ReactElement {
  const context = useHubAppPage();
  const historyRef = useRef<HTMLDivElement>(null);
  const { capabilities } = context;
  const showReleases =
    capabilities['read-release'] || capabilities['upload-release'];
  useEffect(() => {
    if (context.releasesCollapsed)
      historyRef.current?.scrollIntoView?.({ block: 'start' });
  }, [context.releasesCollapsed]);
  return (
    <>
      {context.panelLoading ? (
        <AppTabLoading />
      ) : (
        <div className='space-y-6'>
          {showReleases ? (
            <Releases
              app={context.app}
              canRead={capabilities['read-release']}
              canUpload={capabilities['upload-release']}
              canDeploy={
                capabilities.deploy &&
                capabilities['read-config'] &&
                capabilities['read-config-template']
              }
              busy={context.busy}
              collapsed={context.releasesCollapsed}
              onCollapsed={context.onReleasesCollapsed}
              onDeploy={context.onDeploy}
              onUpload={context.onUpload}
            />
          ) : null}
          {capabilities['read-deployment'] &&
          (context.app.hasReleases ||
            !showReleases ||
            context.deploymentPagination.total > 0) ? (
            <div
              ref={historyRef}
              className={showReleases ? 'scroll-mt-6 border-t pt-6' : undefined}
            >
              <Deployments
                app={context.app}
                pagination={context.deploymentPagination}
                loading={context.deploymentsLoading}
                onPage={context.onDeploymentPage}
                busy={context.busy || context.deploymentsLoading}
                canDeploy={false}
                canRollback={capabilities.rollback}
                onDeploy={context.onDeploy}
                onRollback={context.onRollback}
              />
            </div>
          ) : null}
        </div>
      )}
      <Outlet />
    </>
  );
}

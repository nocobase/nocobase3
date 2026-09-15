import { useClientApplication } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, type ReactElement } from 'react';
import type { AuthorizationOptions } from '../authorization-client.js';
import { PermissionsPage } from '../components/page-shell.js';
import {
  grantablePages,
  withPageResources,
} from '../components/page-options.js';
import { PermissionSetsPanel } from './permission-sets/index.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
  useUserDirectory,
} from './page-support.js';

export default function PermissionSetsPage(): ReactElement {
  const page = useAuthorizationPageData('authz/permission-sets/options');
  const users = useUserDirectory();
  // Page names live in client route declarations, which the server never sees. The browser holds the registry, so the
  // grantable pages are merged in here rather than hardcoded into the options endpoint.
  const application = useClientApplication();
  const { t } = useTranslation();
  const { options } = page;
  const pageOptions = useMemo<AuthorizationOptions | undefined>(
    () =>
      options &&
      withPageResources(
        options,
        grantablePages(application.runtime.routes).map((page) => ({
          value: page.name,
          label:
            page.title === undefined
              ? page.name
              : t(page.title, {
                  ns: page.packageName,
                  defaultValue: page.title,
                }),
        })),
      ),
    [application, options, t],
  );
  return (
    <PermissionsPage
      title='Permission Sets'
      description='Permission sets grant access: bundle the resources and actions people need, then assign the bundle to them.'
    >
      {pageOptions ? (
        <PermissionSetsPanel options={pageOptions} directory={users} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}

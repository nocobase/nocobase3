import { useClientApplication } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, type ReactElement } from 'react';
import type { AuthorizationOptions } from '../authorization-client.js';
import { PermissionsPage } from '../components/page-shell.js';
import {
  grantablePages,
  withPageResources,
} from '../components/page-options.js';
import { useAuthorizationTranslation } from '../i18n.js';
import { PermissionSetsPanel } from './permission-sets/index.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
  useUserDirectory,
} from './page-support.js';

export default function PermissionSetsPage(): ReactElement {
  const t = useAuthorizationTranslation();
  const page = useAuthorizationPageData('authz/permission-sets/options');
  const users = useUserDirectory();
  // Page names live in client route declarations, which the server never sees. The browser holds the registry, so the
  // grantable pages are merged in here rather than hardcoded into the options endpoint.
  const application = useClientApplication();
  // Page names come from other packages' route declarations, so they are translated in their own namespace.
  const { t: translatePageName } = useTranslation();
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
              : translatePageName(page.title, {
                  ns: page.packageName,
                  defaultValue: page.title,
                }),
        })),
      ),
    [application, options, translatePageName],
  );
  return (
    <PermissionsPage
      title={t('permissionSets.page.title')}
      description={t('permissionSets.page.description')}
    >
      {pageOptions ? (
        <PermissionSetsPanel options={pageOptions} directory={users} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}

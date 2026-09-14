import { useClientApplication } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, type ReactElement } from 'react';
import type { AuthorizationOptions } from '../authorization-client.js';
import {
  grantablePages,
  withPageResources,
} from '../components/page-options.js';
import { PermissionSetsPanel } from './permission-sets-panel.js';
import {
  AuthorizationSettingsPage,
  useAuthorizationPageData,
  useUserDirectory,
} from './page-support.js';

export default function PermissionSetsPage(): ReactElement {
  const { options, error } = useAuthorizationPageData(
    'authz/permission-sets/options',
  );
  const users = useUserDirectory();
  // Page names live in client route declarations, which the server never sees. The browser holds the registry, so the
  // grantable pages are merged in here rather than hardcoded into the options endpoint.
  const application = useClientApplication();
  const { t } = useTranslation();
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
    <AuthorizationSettingsPage
      eyebrow='Authorization'
      title='Permission Sets'
      description='Create reusable permission bundles and assign them to users.'
      error={error}
      loading={!pageOptions}
    >
      {pageOptions ? (
        <PermissionSetsPanel options={pageOptions} directory={users} />
      ) : null}
    </AuthorizationSettingsPage>
  );
}

import { useClientApplication } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, type ReactElement } from 'react';
import type { AuthorizationOptions } from '../authorization-client.js';
import {
  grantablePages,
  pageGroups,
  withPageResources,
} from '../components/page-options.js';
import { PermissionSetsPanel } from './permission-sets/index.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
} from './page-support.js';

export default function PermissionSetsPage(): ReactElement {
  const page = useAuthorizationPageData('authz/permission-sets/options');
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
          ...(page.group ? { group: page.group } : {}),
          label:
            page.title === undefined
              ? page.name
              : translatePageName(page.title, {
                  ns: page.packageName,
                  defaultValue: page.title,
                }),
        })),
        pageGroups(application.runtime.routes, (title, ns) =>
          translatePageName(title, { ns, defaultValue: title }),
        ),
      ),
    [application, options, translatePageName],
  );
  return pageOptions ? (
    <PermissionSetsPanel options={pageOptions} />
  ) : (
    <AuthorizationPageState {...page} />
  );
}

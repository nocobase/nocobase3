import { useClientApplication } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo } from 'react';
import type { AuthorizationOptions } from '../authorization-client.js';
import {
  grantablePages,
  pageGroups,
  withPageResources,
} from './page-options.js';

export function useResourceOptions(
  options: AuthorizationOptions | undefined,
): AuthorizationOptions | undefined {
  const application = useClientApplication();
  const routes = application.runtime.routes;
  // Page names come from other packages' route declarations, so they are translated in their own namespace.
  const { t: translatePageName } = useTranslation();
  const pageOptions = useMemo<AuthorizationOptions | undefined>(
    () =>
      options &&
      withPageResources(
        options,
        grantablePages(routes).map((page) => ({
          value: page.name,
          searchText: page.title,
          ...(page.group ? { group: page.group } : {}),
          label:
            page.title === undefined
              ? page.name
              : translatePageName(page.title, {
                  ns: page.packageName,
                  defaultValue: page.title,
                }),
        })),
        pageGroups(routes, (title, ns) =>
          translatePageName(title, { ns, defaultValue: title }),
        ),
      ),
    [routes, options, translatePageName],
  );
  return pageOptions;
}

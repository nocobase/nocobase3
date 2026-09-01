import type {
  AppClientRegisteredRoute,
  AppClientRegisteredSetting,
  AppClientRouteComponentLoader,
} from '@nocobase/app-client/plugins';

/**
 * What a lazily-loaded page needs to render itself, independent of whether it was contributed as a route or as a
 * settings page. Both kinds check access, load a component on demand, and report failures the same way.
 */
export interface ClientPageDescriptor {
  readonly access: { readonly resource: string; readonly action: string };
  readonly checkAccess: boolean;
  readonly componentLoader: AppClientRouteComponentLoader;
  readonly kind: 'page' | 'setting';
  readonly label: string;
  readonly packageName: string;
}

export function describeRoutePage(
  route: AppClientRegisteredRoute,
): ClientPageDescriptor {
  return {
    access: route.access ?? { resource: route.name, action: 'access' },
    checkAccess: route.auth === 'required',
    componentLoader: route.componentLoader,
    kind: 'page',
    label: route.name,
    packageName: route.packageName,
  };
}

export function describeSettingPage(
  setting: AppClientRegisteredSetting,
): ClientPageDescriptor {
  return {
    // A setting without a declared access rule is readable by anyone who can reach the settings centre. Settings are
    // always behind authentication, so there is no auth variant to consider the way routes have one.
    access: setting.access ?? {
      resource: `settings.${setting.id}`,
      action: 'read',
    },
    checkAccess: setting.access !== undefined,
    componentLoader: setting.pageLoader,
    kind: 'setting',
    label: setting.title,
    packageName: setting.packageName,
  };
}

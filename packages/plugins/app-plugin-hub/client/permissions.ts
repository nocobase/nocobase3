import type { AuthorizationClient } from '@nocobase/app-plugin-authorization/client';
import type { DetailTab } from './pages/hub/types.js';

export const HUB_APP_ACTIONS = [
  'create',
  'update-settings',
  'remove',
  'read-release',
  'upload-release',
  'read-config-template',
  'read-deployment',
  'deploy',
  'rollback',
  'read-config',
  'update-config',
  'refresh',
  'start',
  'stop',
  'restart',
] as const;

export type HubAppAction = (typeof HUB_APP_ACTIONS)[number];
export type HubCapabilities = Readonly<Record<HubAppAction, boolean>>;

export function emptyHubCapabilities(): HubCapabilities {
  return Object.fromEntries(
    HUB_APP_ACTIONS.map((action) => [action, false]),
  ) as unknown as HubCapabilities;
}

export function visibleHubDetailTabs(
  state: { readonly hasReleases: boolean; readonly deployed: boolean },
  capabilities: HubCapabilities,
): readonly DetailTab[] {
  return [
    ...(!state.hasReleases && capabilities['upload-release']
      ? (['development'] as const)
      : []),
    ...(capabilities['read-deployment'] ? (['deployments'] as const) : []),
    ...(capabilities['read-release'] ? (['releases'] as const) : []),
    ...(capabilities['read-config'] ? (['resources'] as const) : []),
    ...(state.deployed && capabilities['read-config']
      ? (['configuration'] as const)
      : []),
    ...(capabilities['update-settings'] || capabilities.remove
      ? (['settings'] as const)
      : []),
  ];
}

export function resolveHubDetailTab(
  requested: DetailTab,
  state: { readonly hasReleases: boolean; readonly deployed: boolean },
  capabilities: HubCapabilities,
): DetailTab {
  const visible = visibleHubDetailTabs(state, capabilities);
  return visible.includes(requested)
    ? requested
    : (visible[0] ?? 'deployments');
}

export async function loadHubCapabilities(
  authorization: Pick<AuthorizationClient, 'can'>,
  appId: string = '*',
): Promise<HubCapabilities> {
  const allowed = await Promise.all(
    HUB_APP_ACTIONS.map((action) =>
      authorization.can({ type: 'hub.app', id: appId }, action),
    ),
  );
  return Object.fromEntries(
    HUB_APP_ACTIONS.map((action, index) => [action, allowed[index] ?? false]),
  ) as unknown as HubCapabilities;
}

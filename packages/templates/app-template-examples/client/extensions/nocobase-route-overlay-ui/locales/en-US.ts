import type { LocaleResource } from '@nocobase/i18n';

// Every string the item renders, under the key its components look up. The values match the components' English
// defaults. Merge this into the locale resources of the namespace that renders the item.
const enUS = {
  'routeOverlay.close': 'Close',
};

export type RouteOverlayUiResource = LocaleResource<typeof enUS>;

export default enUS;

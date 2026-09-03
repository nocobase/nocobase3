import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  navigation: {
    applications: 'Applications',
  },
};

/**
 * English is the source of truth for this plugin's locale shape.
 */
export type HubResource = LocaleResource<typeof enUS>;

export default enUS;

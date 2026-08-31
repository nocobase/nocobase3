import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  language: {
    label: 'Language',
    switchError: 'Unable to switch language.',
  },
};

/**
 * The shape every locale of this namespace follows, derived from the English wording above.
 *
 * English is the source of truth: a key exists here first, and a locale annotated with this type reports both a
 * missing key and one that does not exist here at all.
 */
export type I18nPluginResource = LocaleResource<typeof enUS>;

export default enUS;

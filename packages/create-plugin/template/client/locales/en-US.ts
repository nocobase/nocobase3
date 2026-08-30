import type { LocaleResource } from '@nocobase/app-i18n';

const enUS = {
  greeting: __NOCOBASE_HELLO_MESSAGE_LITERAL__,
};

/**
 * The shape every locale of this plugin follows, derived from the English wording above rather than written out
 * again. English is the source of truth: a key exists here first, and a locale annotated with this type reports both
 * a key that does not exist and one that was left out.
 */
export type __NOCOBASE_SYMBOL_NAME__Resource = LocaleResource<typeof enUS>;

export default enUS;

/**
 * The shape every locale of this namespace follows. English is the source of truth: a key exists here first, and a
 * translation that omits it falls back rather than breaking.
 */
export interface I18nPluginResource {
  readonly language: {
    readonly label: string;
    readonly switchError: string;
  };
}

const enUS: I18nPluginResource = {
  language: {
    label: 'Language',
    switchError: 'Unable to switch language.',
  },
};

export default enUS;

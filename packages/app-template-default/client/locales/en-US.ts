/**
 * The application's own copy, and the source of truth for its keys.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export interface AppResource {
  readonly app: {
    readonly title: string;
  };
  readonly actions: {
    readonly save: string;
    readonly cancel: string;
    readonly confirm: string;
    readonly language: string;
  };
  readonly account: {
    readonly openMenu: string;
    readonly fallback: string;
    readonly signOut: string;
    readonly signingOut: string;
  };
  readonly navigation: {
    readonly home: string;
    readonly open: string;
    readonly close: string;
    readonly expand: string;
    readonly collapse: string;
    readonly label: string;
  };
}

const enUS: AppResource = {
  app: {
    title: 'NocoBase',
  },
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    language: 'Language',
  },
  account: {
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },
};

export default enUS;

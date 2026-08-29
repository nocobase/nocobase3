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
  },
};

export default enUS;

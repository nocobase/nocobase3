import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  routeOverlays: {
    title: 'Route dialogs and drawers',
    description:
      'Open a dialog or drawer, then open another layer. Close the child to return to your draft. Each layer has its own URL.',
    openDialog: 'Open dialog',
    openDrawer: 'Open drawer',
    dialogTitle: 'Dialog example',
    drawerTitle: 'Drawer example',
    hint: 'Type a draft and open a child layer to try keeping your work in place.',
    draft: 'Draft',
    allowClose: 'Allow closing this layer',
    historyHint:
      'Turn off closing to keep this layer open when you press Escape, click outside, or use Close. Browser back and forward still navigate normally.',
  },
  examples: {
    routeOverlays: {
      title: 'Route dialogs and drawers',
      description:
        'Open a dialog or drawer, then open another layer. Close the child to return to your draft. Each layer has its own URL.',
    },
    eyebrow: 'NocoBase Examples',
    title: 'Explore working examples',
    description:
      'Learn by using complete examples. Browse content, explore related records, and see how application features work together.',
    start: 'Start with articles',
    open: 'Open example',
    accessNote:
      'Examples use the application’s authentication and permissions. Sign in as an administrator to explore; other accounts need the corresponding permissions.',
    articles: {
      title: 'Article management',
      description:
        'A complete application feature with initial content, search, drafts, publishing and editing.',
    },
    repository: {
      title: 'Repository queries',
      description:
        'Explore record queries, filters, sorting, pagination and related data.',
    },
    crm: {
      title: 'Customers and contacts',
      description:
        'Browse a CRM example and explore relationships between customers and their contacts.',
    },
    orders: {
      title: 'Orders and products',
      description:
        'Explore orders, line items and products in a connected business example.',
    },
    files: {
      title: 'File management',
      description:
        'Explore the file repository example and its upload and file management interface.',
    },
    routes: {
      title: 'Application routes',
      description:
        'See a plugin contribute a page to the application and share its navigation and layout.',
    },
  },
  articles: {
    title: 'Articles',
    workspace: 'Content workspace',
    description:
      'Capture ideas, share knowledge, and keep your content up to date.',
    new: 'New article',
    edit: 'Edit article',
    all: 'All articles',
    published: 'Published',
    draft: 'Draft',
    archived: 'Archived',
    filter: 'Filter by status',
    search: 'Search titles…',
    loading: 'Loading articles…',
    loadError:
      'Unable to load articles. Check your connection and article permissions.',
    retry: 'Try again',
    empty: 'No matching articles',
    emptyHint: 'Try another search or create your first article.',
    noSummary: 'No summary yet.',
    read: 'Read article',
    total: '{{count}} articles',
    previous: 'Previous page',
    next: 'Next page',
    preview: 'Article preview',
    noContent: 'No content yet.',
    editorHint: 'Save your ideas as a draft, or publish when ready.',
    fieldTitle: 'Title',
    summary: 'Summary',
    content: 'Content',
    status: 'Status',
    saveError: 'Unable to save. Check your permissions and try again.',
    saving: 'Saving…',
  },
  appearance: {
    title: 'Appearance',
    mode: 'Color mode',
    preset: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    themes: { default: 'Default', compact: 'Compact' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Close',
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
    routeOverlays: 'Route dialogs and drawers',
    articles: 'Articles',
    home: 'Home',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;

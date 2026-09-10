import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  numbers: {
    title: 'Numeric types',
    description:
      'Compare actual database values and JavaScript types through Query and Repository. All results come from the current application database.',
    sort: 'Sort rows by',
    asc: 'Ascending',
    desc: 'Descending',
    sortNote:
      'Sorting is performed by the database and preserves numeric ordering; BIGINT and DECIMAL are not converted to Number().',
    source: 'Read with',
    sample: 'Dataset',
    all: 'All samples',
    nullOnly: 'Null sample',
    emptyOnly: 'Empty result',
    refresh: 'Refresh',
    loading: 'Loading numeric examples…',
    error:
      'Unable to load numeric examples. Check your connection and sign-in status, then retry.',
    retry: 'Try again',
    empty: 'No rows in this selection. Aggregate results are shown below.',
    rows: 'Stored values',
    aggregates: 'Aggregate results',
    field: 'Field / type',
    scenario: 'Sample',
    database: 'Database: {{dialect}}',
    legend:
      'Values use JSON notation: strings have quotes; numbers do not. The label below each value shows its actual JavaScript type; null remains null.',
    aggregateNote:
      'COUNT(field) ignores nulls. SUM/AVG for INTEGER, BIGINT and DECIMAL preserve database strings; SUM/AVG for FLOAT and DOUBLE return numbers, matching their field values. MIN/MAX preserve the field type. An empty selection returns 0 for COUNT and null for the other aggregates. The non-null increments ID is counted even in the null sample.',
    precisionNote:
      'Decimal strings retain database formatting. SQLite numeric storage and floating-point arithmetic may round values; converting a result to a string cannot restore lost precision. Avoid Number() when using BIGINT or DECIMAL values.',
    idNote:
      'The ID is generated with increments. Its physical type depends on the database, so Query and Repository may expose different types for this field.',
    samples: {
      small: 'Small integer',
      negative: 'Negative values',
      zero: 'Zero',
      large: 'Large value',
      adjacent: 'Adjacent large integer',
      fraction: 'Fraction',
      null: 'Null values',
    },
  },
  examples: {
    numbers: {
      title: 'Numeric types',
      description:
        'Compare INTEGER, BIGINT, DECIMAL, FLOAT and DOUBLE values, return types and aggregates.',
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
    workflows: {
      title: 'Workflow examples',
      description:
        'Route quotations, generate analytics reports, and diagnose failures. Open a workflow, enable it, and run it with the sample inputs in its description.',
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
    numbers: 'Numeric types',
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

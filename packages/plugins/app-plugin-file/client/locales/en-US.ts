import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  common: {
    actions: {
      cancel: 'Cancel',
      close: 'Close',
      download: 'Download',
      nextFile: 'Next file',
      previousFile: 'Previous file',
      preview: 'Preview',
      remove: 'Remove',
      retry: 'Retry',
    },
    states: {
      done: 'Done',
      failed: 'Failed',
      noFiles: 'No files.',
      pending: 'Pending',
      uploading: 'Uploading',
    },
    visibility: {
      private: 'Private',
      public: 'Public',
    },
  },
  errors: {
    createAccessUrlFailed: 'Unable to create a file access URL.',
    downloadFailed: 'File download failed.',
    fileTypeNotAllowed: 'File type is not allowed.',
    loadPreviewFailed: 'Unable to load the file preview.',
    maxFilesReached: 'The maximum number of files has been reached.',
    previewRequestFailed: 'Preview request failed ({{status}}).',
    removeFailed: 'File removal failed.',
    sizeExceeded: 'File size exceeds {{size}}.',
    uploadFailed: 'File upload failed.',
    urlNotAllowed: 'File URL is not allowed.',
  },
  list: {
    noExtension: 'No extension',
  },
  inventory: {
    nav: 'Files',
    title: 'Files',
    refresh: 'Refresh',
    metrics: {
      sources: 'File sources',
      records: 'File records',
      unavailable: 'Unavailable',
    },
    sources: {
      title: 'Sources',
      loading: 'Loading sources...',
      empty: 'No database file sources are registered.',
      recordCount: '{{count}} files',
      registrations: '{{count}} routes',
      scoped: 'Scoped',
      unscoped: 'Unscoped',
      unavailable: 'Source unavailable',
    },
    files: {
      loading: 'Loading files...',
      empty: 'No file records.',
      noSource: 'No file source selected.',
      unavailable: 'Files unavailable',
      columns: {
        file: 'File',
        disk: 'Disk',
        size: 'Size',
        visibility: 'Visibility',
        created: 'Created',
        updated: 'Updated',
      },
    },
    pagination: {
      total: '{{count}} file records',
      page: '{{page}} / {{totalPages}}',
      previous: 'Previous page',
      next: 'Next page',
    },
    errors: {
      loadSources: 'Unable to load file sources.',
      loadFiles: 'Unable to load files from this source.',
      sourcesUnavailable: 'File sources unavailable',
    },
  },
  preview: {
    downloadFile: 'Download file',
    loading: 'Loading preview...',
    officeLoadFailed: 'Office Online could not load this file.',
    officePublicUrlRequired:
      'Office Online requires an internet-accessible absolute file URL.',
    unavailable: 'Preview is unavailable for this file type.',
  },
  upload: {
    chooseFile: 'Choose file',
    chooseFiles: 'Choose files',
  },
};

export type FileClientResource = LocaleResource<typeof enUS>;

export default enUS;

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
    accessCheckFailed: 'Access check failed ({{status}}){{detail}}',
    checkAccessUrlFailed: 'Unable to check the access URL.',
    createAccessUrlFailed: 'Unable to create a file access URL.',
    downloadFailed: 'File download failed.',
    downloadFileFailed: 'Unable to download the file.',
    fileTypeNotAllowed: 'File type is not allowed.',
    loadPreviewFailed: 'Unable to load the file preview.',
    maxFilesReached: 'The maximum number of files has been reached.',
    previewRequestFailed: 'Preview request failed ({{status}}).',
    removeFailed: 'File removal failed.',
    removeFileFailed: 'Unable to remove the file.',
    shortLivedUrlFailed: 'Unable to create a short-lived access URL.',
    sizeExceeded: 'File size exceeds {{size}}.',
    uploadFailed: 'File upload failed.',
    urlNotAllowed: 'File URL is not allowed.',
  },
  list: {
    noExtension: 'No extension',
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
  demo: {
    access: {
      check: 'Check access URL',
      checking: 'Checking access...',
      description:
        'Open a Public content Route directly, or create and test a short-lived Private URL. Tokens are never displayed.',
      expiresAt: 'Expires at {{expiration}}',
      openPrivate: 'Open Private file',
      openPublic: 'Open Public file: {{filename}}',
      privateDescription:
        'Use a very short TTL, wait for expiration, then check the URL to surface the server response.',
      privateEmpty: 'No Private Order file is available.',
      privateFiles: 'Private files',
      publicEmpty: 'No Public Order file is available.',
      publicFiles: 'Public files',
      requestPrivate: 'Request short-lived URL: {{filename}}',
      serverDefaultExpiration: 'Server default expiration',
      title: 'Access demonstration',
      ttl: 'Short-lived URL TTL in seconds',
      valid: 'The short-lived URL is still valid.',
    },
    avatar: {
      description: 'Private by default. Images only, with a one-file limit.',
      empty: 'No Profile Avatar has been uploaded.',
      previewEmpty: 'No Profile Avatar is available for preview.',
      title: 'One-to-one Profile Avatar',
      upload: 'Upload profile avatar',
    },
    description:
      'This page demonstrates the standard file Route with real Profile and Order records, without requiring a Registry item.',
    errors: {
      loadAttachments: 'The examples or attachment lists could not be loaded.',
      loadDemo: 'Unable to load the File Demo.',
      loadExamples: 'Unable to load file examples ({{status}}).',
      missingExamples: 'File examples response is missing its data envelope.',
      servicesUnavailable:
        'The application storage or database service is not available.',
      signInRequired: 'Sign in to access the File Demo.',
      systemAdministratorRequired:
        'File Demo management requires system administrator access.',
      unavailableTitle: 'File demo is unavailable',
      unableToLoadTitle: 'Unable to load the file demo',
    },
    eyebrow: 'Plugin-owned runtime page',
    legend: {
      label: 'File access legend',
      privateDescription: 'requests an expiring URL before access.',
      publicDescription: 'opens the content Route directly.',
    },
    loading: 'Loading file examples and attachments...',
    order: {
      description:
        'Markdown uses GFM; Office and OpenDocument use Office Online only for internet-accessible HTTP(S) URLs, while local URLs fall back to download.',
      empty: 'No Order Attachments have been uploaded.',
      previewEmpty: 'No Order Attachments are available for preview.',
      title: 'One-to-many Order Attachments',
      upload: 'Upload order attachments',
      uploadAccess: 'Upload access',
      usage: '{{count}} of {{limit}} files used for order {{order}}.',
    },
    previewField: 'Read-only preview field',
    stats: {
      available: 'Available',
      order: 'Order',
      profile: 'Profile',
      profileValue: '{{name}} · ID {{id}}',
      storage: 'Storage and database',
    },
    title: 'File Demo',
  },
};

export type FileClientResource = LocaleResource<typeof enUS>;

export default enUS;

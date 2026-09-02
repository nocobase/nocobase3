import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  errors: {
    contentPathInvalid: 'File content path is invalid.',
    contentPathQueryFragment:
      'File content path must be a root-relative path without a query or fragment.',
    contentPathRootRelative: 'File content path must be root-relative.',
    currentTimeInvalid:
      'Current time must be a non-negative integer in epoch seconds.',
    fileIdRequired: 'A file ID is required.',
    fileLimitReached: 'The configured file count limit has been reached.',
    fileNotFound: 'File was not found.',
    fileSizeInvalid: 'File size must be a non-negative safe integer.',
    fileTypeNotAllowed: 'The uploaded file type is not allowed.',
    inputInvalid: 'File input is invalid.',
    inventoryAccessRequired: 'File inventory access is required.',
    inventoryPaginationInvalid: 'File inventory pagination is invalid.',
    inventorySourceNotFound: 'The registered file source was not found.',
    inventorySourceUnavailable: 'The registered file table is unavailable.',
    multipartFileInvalid: 'A valid multipart file field is required.',
    multipartFileRequired: 'A multipart file field is required.',
    oneFileRequired: 'Exactly one File-compatible file field is required.',
    serviceUnavailable: 'File service is unavailable.',
    storageDiskNotConfigured: 'A file storage disk is not configured.',
    storageDiskUnavailable: 'File storage disk "{{disk}}" is unavailable.',
    storageNotConfigured: 'File storage is not configured.',
    storageObjectNotFound: 'The stored file object was not found.',
    storageReadFailed: 'File storage could not be read.',
    storageUpdateFailed: 'File storage could not be updated.',
    streamedFileSizeRequired: 'File size is required for streamed content.',
    tokenAudienceRequired: 'A file token audience is required.',
    tokenBodyInvalid: 'Token request body must be valid JSON.',
    tokenBodyObjectRequired: 'Token request body must be an object.',
    tokenExpirationNumber: 'Token expiration must be a number of seconds.',
    tokenExpired: 'The file access token has expired.',
    tokenInvalid: 'The file access token is invalid.',
    tokenRequired: 'A file access token is required.',
    tokenSecretRequired: 'A file token secret is required.',
    tokenSigningNotConfigured: 'File access token signing is not configured.',
    tokenTtlInvalid:
      'File token TTL must be an integer between 1 and {{max}} seconds.',
    unsupportedContent: 'Unsupported file content input.',
    uploadTooLarge: 'The uploaded file exceeds the configured size limit.',
    verificationTimeInvalid:
      'Verification time must be a non-negative integer in epoch seconds.',
    visibilityBoolean: 'File visibility must be either true or false.',
    visibilityOverrideNotAllowed:
      'Client file visibility override is not allowed.',
  },
};

export type FileServerResource = LocaleResource<typeof enUS>;

export default enUS;

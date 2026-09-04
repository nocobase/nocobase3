import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  errors: {
    accessDenied: 'Mail settings access is required.',
    idempotencyConflict:
      'The idempotency key is already associated with another request.',
    invalidRequest: 'The mail request is invalid.',
    requestFailed: 'The mail request could not be completed.',
    syncRunNotFound: 'Mail sync run was not found.',
    messageNotFound: 'Mail message was not found.',
    authorizationStateRequired: 'Mail authorization state is required.',
  },
};

export type MailServerResource = LocaleResource<typeof enUS>;
export default enUS;

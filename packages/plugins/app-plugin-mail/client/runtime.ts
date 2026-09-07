import {
  createApiClient,
  resolveAppUrl,
  type ApiClient,
} from '@nocobase/app-client';

import { MailClient } from './mail-client.js';

let mailClient: MailClient | undefined;

export function configureMailClient(appClient: ApiClient): MailClient {
  mailClient = new MailClient(appClient);
  return mailClient;
}

export function getMailClient(): MailClient {
  mailClient ??= new MailClient(
    createApiClient({ baseURL: resolveAppUrl('/api') }),
  );
  return mailClient;
}

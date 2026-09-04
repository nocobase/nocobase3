import { createAppClient, type AppClient } from '@nocobase/app-client';

import { MailClient } from './mail-client.js';

let mailClient: MailClient | undefined;

export function configureMailClient(appClient: AppClient): MailClient {
  mailClient = new MailClient(appClient);
  return mailClient;
}

export function getMailClient(): MailClient {
  mailClient ??= new MailClient(createAppClient());
  return mailClient;
}

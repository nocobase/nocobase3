import type { MailProviderConfig } from '@nocobase/app-plugin-mail/server/types';

export interface ImapSmtpEndpointConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly rejectUnauthorized?: boolean;
}

export interface ImapSmtpMailProviderConfig extends MailProviderConfig {
  readonly type: 'imap-smtp';
  readonly enabled?: boolean;
  readonly imap: ImapSmtpEndpointConfig;
  readonly smtp: ImapSmtpEndpointConfig;
  readonly sentFolder?: string;
  readonly trashFolder?: string;
  readonly draftsFolder?: string;
}

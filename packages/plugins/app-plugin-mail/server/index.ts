export { default } from './plugin.js';
export { mailConfig } from './config.js';
export { createMailProviderRegistry } from './registry.js';
export * from './tokens.js';
export type * from './types.js';
export type { GmailMailProviderConfig } from './adapters/gmail/types.js';
export type { MicrosoftMailProviderConfig } from './adapters/microsoft/types.js';
export type {
  ImapSmtpEndpointConfig,
  ImapSmtpMailProviderConfig,
} from './adapters/imap-smtp/config.js';

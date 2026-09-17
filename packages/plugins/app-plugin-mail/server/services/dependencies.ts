import type { UserAdministrationService } from '@nocobase/app-plugin-authentication';
import { type MailMessageChangeNotifier } from '../realtime.js';
import {
  type MailCredentialVault,
  type MailOutboundAttachmentStorage,
  type MailProviderAdapterResolver,
  type MailProviderConfig,
  type MailProviderContext,
  type MailProviderRegistry,
  type MailStore,
} from '../types.js';

export interface MailOutboxPublisher {
  kick(): void;
}

export interface DefaultMailServiceDependencies {
  readonly users?: Pick<UserAdministrationService, 'list'>;
  readonly store: MailStore;
  readonly adapters: MailProviderAdapterResolver;
  readonly outbox: MailOutboxPublisher;
  readonly syncBatchSize?: number;
  readonly defaultAutomaticSyncIntervalMinutes?: number;
  readonly registry?: MailProviderRegistry;
  readonly providerContext?: MailProviderContext;
  readonly credentials?: MailCredentialVault;
  readonly resolveProviderConfig?: (
    provider: import('../types.js').MailProviderIdentity,
  ) => MailProviderConfig;
  readonly listProviderConfigs?: () => readonly MailProviderConfig[];
  readonly outboundAttachments?: MailOutboundAttachmentStorage;
  readonly messageChangeNotifier?: MailMessageChangeNotifier;
}

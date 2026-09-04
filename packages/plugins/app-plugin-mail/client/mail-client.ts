import type { AppClient } from '@nocobase/app-client';
import type {
  MailAccountView,
  MailAuthorizationStartResult,
  MailComposeInput,
  MailIdentity,
  MailListMessagesInput,
  MailMessage,
  MailMessageSummary,
  MailPage,
  MailProviderView,
  MailStartSyncInput,
  MailSubmissionView,
  MailSyncRunView,
} from '../server/types.js';

export type {
  MailAccountStatus,
  MailAccountView,
  MailAddress,
  MailAuthorizationStartResult,
  MailComposeInput,
  MailIdentity,
  MailInitialSyncPolicy,
  MailMessage,
  MailMessageSummary,
  MailPage,
  MailProviderCapabilities,
  MailProviderView,
  MailStartSyncInput,
  MailSubmissionStatus,
  MailSubmissionView,
  MailSyncMode,
  MailSyncPhase,
  MailSyncRunStatus,
  MailSyncRunView,
} from '../server/types.js';

interface DataResponse<T> {
  readonly data: T;
}

export interface MailAuthorizationRequest {
  readonly type: string;
  readonly name: string;
  readonly scopes?: readonly string[];
}

export interface MailMessagesQuery extends Pick<
  MailListMessagesInput,
  'query' | 'cursor' | 'limit'
> {
  readonly accountId?: string;
  readonly unread?: boolean;
  readonly starred?: boolean;
}

export class MailClient {
  public constructor(private readonly client: AppClient) {}

  public listProviders(): Promise<readonly MailProviderView[]> {
    return this.client
      .request<DataResponse<readonly MailProviderView[]>>('mail/providers')
      .then((response) => response.data);
  }

  public listAccounts(): Promise<readonly MailAccountView[]> {
    return this.client
      .request<DataResponse<readonly MailAccountView[]>>('mail/accounts')
      .then((response) => response.data);
  }

  public startAuthorization(
    input: MailAuthorizationRequest,
  ): Promise<MailAuthorizationStartResult> {
    return this.post<MailAuthorizationStartResult>(
      'mail/authorizations',
      input,
    );
  }

  public listIdentities(accountId: string): Promise<readonly MailIdentity[]> {
    return this.client
      .request<DataResponse<readonly MailIdentity[]>>(
        `mail/accounts/${encodeURIComponent(accountId)}/identities`,
      )
      .then((response) => response.data);
  }

  public startSync(input: MailStartSyncInput): Promise<MailSyncRunView> {
    const { accountId, ...body } = input;
    return this.post<MailSyncRunView>(
      `mail/accounts/${encodeURIComponent(accountId)}/sync`,
      body,
    );
  }

  public getSyncRun(syncRunId: string): Promise<MailSyncRunView> {
    return this.client
      .request<DataResponse<MailSyncRunView>>(
        `mail/sync-runs/${encodeURIComponent(syncRunId)}`,
      )
      .then((response) => response.data);
  }

  public listMessages(
    input: MailMessagesQuery = {},
  ): Promise<MailPage<MailMessageSummary>> {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) parameters.set(key, String(value));
    }
    const query = parameters.size > 0 ? `?${parameters.toString()}` : '';
    return this.client
      .request<DataResponse<MailPage<MailMessageSummary>>>(
        `mail/messages${query}`,
      )
      .then((response) => response.data);
  }

  public getMessage(
    accountId: string,
    messageId: string,
  ): Promise<MailMessage> {
    return this.client
      .request<DataResponse<MailMessage>>(
        `mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`,
      )
      .then((response) => response.data);
  }

  public sendMessage(input: MailComposeInput): Promise<MailSubmissionView> {
    return this.post<MailSubmissionView>('mail/messages/send', input);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.client
      .request<DataResponse<T>>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      .then((response) => response.data);
  }
}

export function mailErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : fallback;
}

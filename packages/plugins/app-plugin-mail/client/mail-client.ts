import type { ApiClient } from '@nocobase/app-client';
import type {
  MailAccountView,
  MailAuthorizationStartResult,
  MailConnectAccountInput,
  MailComposeInput,
  MailBulkComposeInput,
  MailFolder,
  MailIdentity,
  MailSignature,
  MailSaveSignatureInput,
  MailListMessagesInput,
  MailManagedAccountView,
  MailManagedOperationLogsView,
  MailMessage,
  MailMessageSummary,
  MailUpdateMessageInput,
  MailMoveMessageInput,
  MailUpdateMessageLabelsInput,
  MailPage,
  MailProviderView,
  MailStartSyncInput,
  MailSubmissionLogView,
  MailSubmissionView,
  MailSyncRunView,
  MailUpdateAccountInput,
  MailUpdateIdentityInput,
  MailOutboundAttachmentView,
  MailTemplate,
  MailSaveTemplateInput,
} from '../server/types.js';

export type {
  MailAccountStatus,
  MailAccountView,
  MailAddress,
  MailAuthorizationStartResult,
  MailConnectAccountInput,
  MailComposeInput,
  MailBulkComposeInput,
  MailFolder,
  MailIdentity,
  MailSignature,
  MailSaveSignatureInput,
  MailInitialSyncPolicy,
  MailManagedAccountView,
  MailManagedOperationLogsView,
  MailMessage,
  MailMessageSummary,
  MailPage,
  MailProviderCapabilities,
  MailProviderView,
  MailStartSyncInput,
  MailSubmissionStatus,
  MailSubmissionLogView,
  MailSubmissionView,
  MailSyncMode,
  MailSyncPhase,
  MailSyncRunStatus,
  MailSyncRunView,
  MailOutboundAttachmentView,
  MailTemplate,
  MailSaveTemplateInput,
} from '../server/types.js';

interface DataResponse<T> {
  readonly data: T;
}

export interface MailAuthorizationRequest {
  readonly type: string;
  readonly name: string;
  readonly scopes?: readonly string[];
}

export type MailConnectAccountRequest = Omit<
  MailConnectAccountInput,
  'provider'
> & {
  readonly type: string;
  readonly name: string;
};

export interface MailMessagesQuery extends Pick<
  MailListMessagesInput,
  'query' | 'cursor' | 'limit' | 'conversationId'
> {
  readonly accountId?: string;
  readonly folderId?: string;
  readonly unread?: boolean;
  readonly starred?: boolean;
}

export class MailClient {
  public constructor(private readonly client: ApiClient) {}

  public listProviders(): Promise<readonly MailProviderView[]> {
    return this.client
      .request<DataResponse<readonly MailProviderView[]>>({
        path: 'mail/providers',
      })
      .then((response) => response.data);
  }

  public listAccounts(): Promise<readonly MailAccountView[]> {
    return this.client
      .request<DataResponse<readonly MailAccountView[]>>({
        path: 'mail/accounts',
      })
      .then((response) => response.data);
  }

  public updateAccount(
    input: MailUpdateAccountInput,
  ): Promise<MailAccountView> {
    const { accountId, ...json } = input;
    return this.client
      .request<DataResponse<MailAccountView>>({
        path: `mail/accounts/${encodeURIComponent(accountId)}`,
        method: 'PATCH',
        json,
      })
      .then((response) => response.data);
  }

  public removeAccount(accountId: string): Promise<void> {
    return this.client.request<void>({
      path: `mail/accounts/${encodeURIComponent(accountId)}`,
      method: 'DELETE',
    });
  }

  public listManagedAccounts(): Promise<readonly MailManagedAccountView[]> {
    return this.client
      .request<DataResponse<readonly MailManagedAccountView[]>>({
        path: 'mail/settings/accounts',
      })
      .then((response) => response.data);
  }

  public listManagedOperationLogs(): Promise<MailManagedOperationLogsView> {
    return this.client
      .request<DataResponse<MailManagedOperationLogsView>>({
        path: 'mail/settings/operation-logs',
      })
      .then((response) => response.data);
  }

  public getUnreadCount(): Promise<number> {
    return this.client
      .request<DataResponse<number>>({ path: 'mail/unread-count' })
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

  public connectAccount(
    input: MailConnectAccountRequest,
  ): Promise<MailAccountView> {
    const { type, name, ...json } = input;
    return this.post<MailAccountView>('mail/accounts/connect', {
      type,
      name,
      ...json,
    });
  }

  public listIdentities(accountId: string): Promise<readonly MailIdentity[]> {
    return this.client
      .request<DataResponse<readonly MailIdentity[]>>({
        path: `mail/accounts/${encodeURIComponent(accountId)}/identities`,
      })
      .then((response) => response.data);
  }

  public updateIdentity(input: MailUpdateIdentityInput): Promise<MailIdentity> {
    const { accountId, identityId, ...json } = input;
    return this.client
      .request<DataResponse<MailIdentity>>({
        path: `mail/accounts/${encodeURIComponent(accountId)}/identities/${encodeURIComponent(identityId)}`,
        method: 'PATCH',
        json,
      })
      .then((response) => response.data);
  }

  public listSignatures(
    accountId: string,
    identityId: string,
  ): Promise<readonly MailSignature[]> {
    return this.client
      .request<DataResponse<readonly MailSignature[]>>({
        path: `mail/accounts/${encodeURIComponent(accountId)}/identities/${encodeURIComponent(identityId)}/signatures`,
      })
      .then((response) => response.data);
  }

  public saveSignature(input: MailSaveSignatureInput): Promise<MailSignature> {
    const { id, accountId, identityId, ...json } = input;
    return this.client
      .request<DataResponse<MailSignature>>({
        path: `mail/accounts/${encodeURIComponent(accountId)}/identities/${encodeURIComponent(identityId)}/signatures${id ? `/${encodeURIComponent(id)}` : ''}`,
        method: id ? 'PATCH' : 'POST',
        json,
      })
      .then((response) => response.data);
  }

  public deleteSignature(
    accountId: string,
    identityId: string,
    signatureId: string,
  ): Promise<void> {
    return this.client.request<void>({
      path: `mail/accounts/${encodeURIComponent(accountId)}/identities/${encodeURIComponent(identityId)}/signatures/${encodeURIComponent(signatureId)}`,
      method: 'DELETE',
    });
  }

  public listFolders(accountId: string): Promise<readonly MailFolder[]> {
    return this.client
      .request<DataResponse<readonly MailFolder[]>>({
        path: `mail/accounts/${encodeURIComponent(accountId)}/folders`,
      })
      .then((response) => response.data);
  }

  public createLabel(accountId: string, name: string): Promise<MailFolder> {
    return this.post<MailFolder>(
      `mail/accounts/${encodeURIComponent(accountId)}/labels`,
      { name },
    );
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
      .request<DataResponse<MailSyncRunView>>({
        path: `mail/sync-runs/${encodeURIComponent(syncRunId)}`,
      })
      .then((response) => response.data);
  }

  public listSyncRuns(): Promise<readonly MailSyncRunView[]> {
    return this.client
      .request<DataResponse<readonly MailSyncRunView[]>>({
        path: 'mail/sync-runs',
      })
      .then((response) => response.data);
  }

  public retrySyncRun(syncRunId: string): Promise<MailSyncRunView> {
    return this.post<MailSyncRunView>(
      `mail/sync-runs/${encodeURIComponent(syncRunId)}/retry`,
      {},
    );
  }

  public cancelSyncRun(syncRunId: string): Promise<MailSyncRunView> {
    return this.post<MailSyncRunView>(
      `mail/sync-runs/${encodeURIComponent(syncRunId)}/cancel`,
      {},
    );
  }

  public listSubmissions(): Promise<readonly MailSubmissionLogView[]> {
    return this.client
      .request<DataResponse<readonly MailSubmissionLogView[]>>({
        path: 'mail/submissions',
      })
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
      .request<DataResponse<MailPage<MailMessageSummary>>>({
        path: `mail/messages${query}`,
      })
      .then((response) => response.data);
  }

  public getMessage(
    accountId: string,
    messageId: string,
  ): Promise<MailMessage> {
    return this.client
      .request<DataResponse<MailMessage>>({
        path: `mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`,
      })
      .then((response) => response.data);
  }

  public downloadAttachment(
    accountId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<ReadableStream<Uint8Array>> {
    return this.client.stream({
      path: `mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    });
  }

  public listConversationMessages(
    accountId: string,
    conversationId: string,
    input: Pick<MailListMessagesInput, 'cursor' | 'limit'> = {},
  ): Promise<MailPage<MailMessage>> {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) parameters.set(key, String(value));
    }
    const query = parameters.size > 0 ? `?${parameters.toString()}` : '';
    return this.client
      .request<DataResponse<MailPage<MailMessage>>>({
        path: `mail/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/messages${query}`,
      })
      .then((response) => response.data);
  }

  public sendMessage(input: MailComposeInput): Promise<MailSubmissionView> {
    return this.post<MailSubmissionView>('mail/messages/send', input);
  }

  public sendBulk(
    input: MailBulkComposeInput,
  ): Promise<readonly MailSubmissionView[]> {
    return this.post<readonly MailSubmissionView[]>(
      'mail/messages/bulk',
      input,
    );
  }

  public uploadAttachment(file: File): Promise<MailOutboundAttachmentView> {
    const body = new FormData();
    body.append('file', file);
    return this.client
      .request<DataResponse<MailOutboundAttachmentView>>({
        path: 'mail/attachments',
        method: 'POST',
        body,
      })
      .then((response) => response.data);
  }

  public listTemplates(): Promise<readonly MailTemplate[]> {
    return this.client
      .request<DataResponse<readonly MailTemplate[]>>({
        path: 'mail/templates',
      })
      .then((response) => response.data);
  }

  public saveTemplate(input: MailSaveTemplateInput): Promise<MailTemplate> {
    const { id, ...json } = input;
    return this.client
      .request<DataResponse<MailTemplate>>({
        path: id
          ? `mail/templates/${encodeURIComponent(id)}`
          : 'mail/templates',
        method: id ? 'PATCH' : 'POST',
        json,
      })
      .then((response) => response.data);
  }

  public deleteTemplate(templateId: string): Promise<void> {
    return this.client
      .request({
        path: `mail/templates/${encodeURIComponent(templateId)}`,
        method: 'DELETE',
      })
      .then(() => undefined);
  }

  public saveDraft(input: MailComposeInput): Promise<MailMessage> {
    return this.post<MailMessage>('mail/messages/drafts', input);
  }

  public updateMessage(input: MailUpdateMessageInput): Promise<MailMessage> {
    const { accountId, messageId, ...json } = input;
    return this.client
      .request<DataResponse<MailMessage>>({
        path: `mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`,
        method: 'PATCH',
        json,
      })
      .then((response) => response.data);
  }

  public updateMessageLabels(
    input: MailUpdateMessageLabelsInput,
  ): Promise<MailMessage> {
    const { accountId, messageId, ...json } = input;
    return this.client
      .request<DataResponse<MailMessage>>({
        path: `mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}/labels`,
        method: 'PATCH',
        json,
      })
      .then((response) => response.data);
  }

  public moveMessage(input: MailMoveMessageInput): Promise<MailMessage> {
    const { accountId, messageId, ...json } = input;
    return this.client
      .request<DataResponse<MailMessage>>({
        path: `mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}/move`,
        method: 'POST',
        json,
      })
      .then((response) => response.data);
  }

  public deleteMessage(
    accountId: string,
    messageId: string,
    permanently = false,
  ): Promise<void> {
    return this.client.request<void>({
      path: `mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`,
      method: 'DELETE',
      query: { permanently },
    });
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.client
      .request<DataResponse<T>>({
        path,
        method: 'POST',
        json: body,
      })
      .then((response) => response.data);
  }
}

export function mailErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : fallback;
}

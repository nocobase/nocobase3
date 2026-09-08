import type {
  MailAccount,
  MailAddress,
  MailAttachmentContent,
  MailAuthorizedAccount,
  MailProviderAdapter,
  MailProviderAuthorization,
  MailProviderChangePage,
  MailProviderConfig,
  MailProviderContext,
  MailProviderDefinition,
  MailProviderError,
  MailProviderFolderPage,
  MailProviderListChangesInput,
  MailProviderListFoldersInput,
  MailProviderListMessagesInput,
  MailProviderMessagePage,
  MailProviderResult,
  MailProviderSendInput,
  MailProviderSendResult,
  MailProviderUpsertPushSubscriptionInput,
  MailProviderUpsertPushSubscriptionResult,
  MailSyncCursor,
  NormalizedMailAttachment,
  NormalizedMailFolder,
  NormalizedMailMessage,
} from '@nocobase/app-plugin-mail/server/types';

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
] as const;

export interface GmailMailProviderConfig extends MailProviderConfig {
  readonly type: 'gmail';
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scopes?: readonly string[];
  readonly authorizationEndpoint?: string;
  readonly tokenEndpoint?: string;
  readonly apiBaseUrl?: string;
  readonly pushTopicName?: string;
  readonly pushLabelIds?: readonly string[];
}

interface GmailCredential {
  readonly provider: 'gmail';
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
  readonly scopes: readonly string[];
  readonly tokenType: string;
}

interface GmailTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GmailProfile {
  emailAddress?: string;
  historyId?: string;
}

interface GmailWatchResponse {
  historyId?: string;
  expiration?: string;
}

interface GmailSendAsList {
  sendAs?: readonly {
    sendAsEmail?: string;
    displayName?: string;
    signature?: string;
    isPrimary?: boolean;
    verificationStatus?: string;
  }[];
}

interface GmailHeader {
  name?: string;
  value?: string;
}

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: readonly GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: readonly GmailPart[];
}

interface GmailMessageResource {
  id?: string;
  threadId?: string;
  labelIds?: readonly string[];
  snippet?: string;
  internalDate?: string;
  historyId?: string;
  payload?: GmailPart;
}

interface GmailDraftResource {
  readonly id?: string;
  readonly message?: GmailMessageResource;
}

interface GmailDraftList {
  readonly drafts?: readonly GmailDraftResource[];
  readonly nextPageToken?: string;
}

interface GmailMessageList {
  messages?: readonly { id?: string }[];
  nextPageToken?: string;
}

interface GmailHistoryList {
  history?: readonly {
    messages?: readonly { id?: string }[];
    messagesAdded?: readonly { message?: { id?: string } }[];
    messagesDeleted?: readonly { message?: { id?: string } }[];
    labelsAdded?: readonly { message?: { id?: string } }[];
    labelsRemoved?: readonly { message?: { id?: string } }[];
  }[];
  historyId?: string;
  nextPageToken?: string;
}

interface GmailLabelList {
  labels?: readonly {
    id?: string;
    name?: string;
    type?: string;
    messagesUnread?: number;
  }[];
}

interface GmailCursorValue {
  readonly historyId: string;
  readonly pageToken?: string;
  readonly capturedAt?: string;
  readonly recoveryAfter?: string;
  readonly recoveryPageToken?: string;
}

export const gmailMailProviderDefinition: MailProviderDefinition<GmailMailProviderConfig> =
  {
    type: 'gmail',
    label: 'Gmail',
    capabilities: {
      receive: true,
      send: true,
      incrementalSync: true,
      pushNotifications: true,
      folders: true,
      labels: true,
      drafts: true,
      moveMessage: true,
      aliases: true,
    },
    validateConfig(config: GmailMailProviderConfig): void {
      if (!config.clientId || !config.clientSecret) {
        throw new Error('Gmail OAuth clientId and clientSecret are required.');
      }
    },
    authorization: createAuthorization(),
    push: {
      parse(input) {
        const message = record(input.body).message;
        const data =
          typeof record(message).data === 'string'
            ? (record(message).data as string)
            : undefined;
        if (!data) return invalidPushNotification();
        try {
          const payload = JSON.parse(
            Buffer.from(data, 'base64url').toString('utf8'),
          ) as { emailAddress?: unknown };
          if (typeof payload.emailAddress !== 'string') {
            return invalidPushNotification();
          }
          return {
            ok: true,
            value: {
              notifications: [{ accountAddress: payload.emailAddress }],
            },
          };
        } catch {
          return invalidPushNotification();
        }
      },
    },
    async createAdapter(
      context: MailProviderContext,
      config: GmailMailProviderConfig,
      account: MailAccount,
    ): Promise<MailProviderAdapter> {
      return new GmailMailProviderAdapter(context, config, account);
    },
  };

function createAuthorization(): MailProviderAuthorization<GmailMailProviderConfig> {
  return {
    async start(_context, config, input) {
      const allowedScopes: readonly string[] = config.scopes ?? DEFAULT_SCOPES;
      const scopes = input.scopes?.length ? input.scopes : allowedScopes;
      if (scopes.some((scope) => !allowedScopes.includes(scope))) {
        return failure(
          'GMAIL_SCOPE_NOT_ALLOWED',
          'Requested Gmail OAuth scopes are not allowed by Provider configuration.',
          'configuration',
          false,
        );
      }
      const url = new URL(
        config.authorizationEndpoint ??
          'https://accounts.google.com/o/oauth2/v2/auth',
      );
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: input.redirectUri,
        response_type: 'code',
        scope: scopes.join(' '),
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
        state: input.state,
        code_challenge: input.codeChallenge,
        code_challenge_method: 'S256',
      }).toString();
      return {
        ok: true,
        value: { authorizationUrl: url.toString(), state: input.state },
      };
    },
    async complete(context, config, input) {
      const token = await exchangeToken(
        config,
        {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code: input.code,
          code_verifier: input.codeVerifier,
          redirect_uri: input.redirectUri,
          grant_type: 'authorization_code',
        },
        input.signal,
      );
      if (!token.ok) return token;
      if (!token.value.refresh_token) {
        return failure(
          'GMAIL_REFRESH_TOKEN_MISSING',
          'Google did not return an offline refresh token.',
          'authentication',
          false,
        );
      }
      const expiresAt = expiry(token.value.expires_in);
      const scopes = splitScopes(
        token.value.scope,
        config.scopes ?? DEFAULT_SCOPES,
      );
      const credentialReference = await context.credentials.put({
        provider: 'gmail',
        accessToken: required(token.value.access_token, 'Gmail access token'),
        refreshToken: token.value.refresh_token,
        expiresAt,
        scopes,
        tokenType: token.value.token_type ?? 'Bearer',
      } satisfies GmailCredential);
      try {
        const profile = await gmailRequest<GmailProfile>(
          config,
          required(token.value.access_token, 'Gmail access token'),
          '/users/me/profile',
          { signal: input.signal },
        );
        if (!profile.ok) {
          await context.credentials.delete(credentialReference);
          return profile;
        }
        if (!profile.value.emailAddress) {
          await context.credentials.delete(credentialReference);
          return failure(
            'GMAIL_PROFILE_INVALID',
            'Gmail profile did not include an email address.',
            'provider',
            false,
          );
        }
        const aliases = await gmailRequest<GmailSendAsList>(
          config,
          required(token.value.access_token, 'Gmail access token'),
          '/users/me/settings/sendAs',
          { signal: input.signal },
        );
        const identities = aliases.ok
          ? (aliases.value.sendAs ?? []).flatMap((alias) =>
              alias.sendAsEmail &&
              (alias.isPrimary || alias.verificationStatus === 'accepted')
                ? [
                    {
                      address: alias.sendAsEmail,
                      displayName: alias.displayName,
                      signatureText: htmlToText(alias.signature),
                      signatureHtml: alias.signature,
                      isPrimary:
                        alias.isPrimary ||
                        alias.sendAsEmail === profile.value.emailAddress,
                      canSend: true,
                    },
                  ]
                : [],
            )
          : [];
        return {
          ok: true,
          value: {
            address: profile.value.emailAddress,
            credentialReference,
            scopes,
            credentialExpiresAt: expiresAt,
            identities:
              identities.length > 0
                ? identities
                : [
                    {
                      address: profile.value.emailAddress,
                      isPrimary: true,
                      canSend: true,
                    },
                  ],
          } satisfies MailAuthorizedAccount,
        };
      } catch (error) {
        await context.credentials.delete(credentialReference);
        throw error;
      }
    },
  };
}

export class GmailMailProviderAdapter implements MailProviderAdapter {
  public readonly identity: MailAccount['provider'];
  public readonly capabilities: MailProviderDefinition['capabilities'] =
    gmailMailProviderDefinition.capabilities;
  public readonly pushNotificationsConfigured: boolean;

  public constructor(
    private readonly context: MailProviderContext,
    private readonly config: GmailMailProviderConfig,
    private readonly account: MailAccount,
  ) {
    this.identity = account.provider;
    this.pushNotificationsConfigured = Boolean(config.pushTopicName);
  }

  public async upsertPushSubscription(
    input: MailProviderUpsertPushSubscriptionInput,
  ): Promise<MailProviderResult<MailProviderUpsertPushSubscriptionResult>> {
    if (!this.config.pushTopicName) {
      return failure(
        'GMAIL_PUSH_TOPIC_REQUIRED',
        'Gmail push notifications require pushTopicName.',
        'configuration',
        false,
      );
    }
    const result = await this.request<GmailWatchResponse>('/users/me/watch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        topicName: this.config.pushTopicName,
        ...(this.config.pushLabelIds?.length
          ? {
              labelIds: this.config.pushLabelIds,
              labelFilterBehavior: 'include',
            }
          : {}),
      }),
      signal: input.signal,
    });
    if (!result.ok) return result;
    const expiration = Number(result.value.expiration);
    if (!Number.isFinite(expiration)) {
      return failure(
        'GMAIL_PUSH_EXPIRATION_MISSING',
        'Gmail did not return a push watch expiration.',
        'provider',
        false,
      );
    }
    const expiresAt = new Date(expiration).toISOString();
    return {
      ok: true,
      value: {
        providerSubscriptionId: this.account.address,
        renewAfter: new Date(
          Math.min(Date.now() + 86_400_000, expiration - 3_600_000),
        ).toISOString(),
        expiresAt,
      },
    };
  }

  public deletePushSubscription(
    _providerSubscriptionId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    return this.emptyRequest('/users/me/stop', { method: 'POST', signal });
  }

  public async getCurrentSyncCursor(
    signal?: AbortSignal,
  ): Promise<MailProviderResult<MailSyncCursor>> {
    const query = new URLSearchParams({
      maxResults: '1',
      includeSpamTrash: 'true',
    });
    const page = await this.request<GmailMessageList>(
      `/users/me/messages?${query.toString()}`,
      { signal },
    );
    if (!page.ok) return page;
    const latestMessageId = page.value.messages?.find(
      (message) => message.id,
    )?.id;
    if (latestMessageId) {
      const message = await this.request<GmailMessageResource>(
        `/users/me/messages/${encodeURIComponent(latestMessageId)}?format=minimal`,
        { signal },
      );
      if (!message.ok) return message;
      if (message.value.historyId) {
        return {
          ok: true,
          value: gmailCursor(
            message.value.historyId,
            undefined,
            new Date().toISOString(),
          ),
        };
      }
    }

    const profile = await this.request<GmailProfile>('/users/me/profile', {
      signal,
    });
    if (!profile.ok) return profile;
    return profile.value.historyId
      ? {
          ok: true,
          value: gmailCursor(
            profile.value.historyId,
            undefined,
            new Date().toISOString(),
          ),
        }
      : failure(
          'GMAIL_HISTORY_ID_MISSING',
          'Gmail did not provide a history ID for the initial sync baseline.',
          'provider',
          false,
        );
  }

  public async listFolders(
    input: MailProviderListFoldersInput,
  ): Promise<MailProviderResult<MailProviderFolderPage>> {
    const result = await this.request<GmailLabelList>('/users/me/labels', {
      signal: input.signal,
    });
    if (!result.ok) return result;
    const folders = (result.value.labels ?? []).flatMap((label) =>
      label.id
        ? [
            {
              providerFolderId: label.id,
              type: gmailFolderType(label.id),
              name: label.name ?? label.id,
              unreadCount: label.messagesUnread,
              kind: 'label' as const,
            },
          ]
        : [],
    );
    const completeFolders = [
      ...folders,
      {
        providerFolderId: '__archive__',
        type: 'archive' as const,
        name: 'Archive',
        kind: 'label' as const,
      },
    ];
    return {
      ok: true,
      value: {
        folders: completeFolders,
        completeProviderFolderIds: completeFolders.map(
          (folder) => folder.providerFolderId,
        ),
      },
    };
  }

  public async listMessages(
    input: MailProviderListMessagesInput,
  ): Promise<MailProviderResult<MailProviderMessagePage>> {
    const query = new URLSearchParams();
    query.set('maxResults', String(Math.min(input.limit ?? 100, 500)));
    query.set('includeSpamTrash', 'true');
    if (input.cursor) query.set('pageToken', input.cursor);
    if (input.receivedAfter) {
      const seconds = Math.floor(
        new Date(input.receivedAfter).getTime() / 1000,
      );
      if (Number.isFinite(seconds)) query.set('q', `after:${seconds}`);
    }
    const page = await this.request<GmailMessageList>(
      `/users/me/messages?${query.toString()}`,
      { signal: input.signal },
    );
    if (!page.ok) return page;
    const messages = await mapConcurrent(
      (page.value.messages ?? []).flatMap((item) => (item.id ? [item.id] : [])),
      10,
      async (id) => this.getMessage(id, input.signal),
    );
    const failed = messages.find(
      (result) => !result.ok && result.error.code !== 'GMAIL_HTTP_404',
    );
    if (failed && !failed.ok) return failed;
    return {
      ok: true,
      value: {
        messages: messages.flatMap((result) =>
          result.ok ? [result.value] : [],
        ),
        nextCursor: page.value.nextPageToken,
      },
    };
  }

  public async listChanges(
    input: MailProviderListChangesInput,
  ): Promise<MailProviderResult<MailProviderChangePage>> {
    const cursor = parseGmailCursor(input.cursor);
    if (!cursor)
      return failure(
        'GMAIL_SYNC_CURSOR_INVALID',
        'Gmail sync cursor is invalid.',
        'provider',
        false,
      );
    if (cursor.recoveryAfter) {
      return this.listRecoveryChanges(cursor, input);
    }
    const query = new URLSearchParams({
      startHistoryId: cursor.historyId,
      maxResults: String(Math.min(input.limit, 500)),
    });
    if (cursor.pageToken) query.set('pageToken', cursor.pageToken);
    const history = await this.request<GmailHistoryList>(
      `/users/me/history?${query.toString()}`,
      { signal: input.signal },
    );
    if (!history.ok) {
      return history.error.code === 'GMAIL_HTTP_404'
        ? this.listRecoveryChanges(cursor, input)
        : history;
    }
    const deleted = new Set<string>();
    const changed = new Set<string>();
    for (const record of history.value.history ?? []) {
      for (const item of record.messages ?? [])
        if (item.id) changed.add(item.id);
      for (const item of record.messagesAdded ?? [])
        if (item.message?.id) changed.add(item.message.id);
      for (const item of record.labelsAdded ?? [])
        if (item.message?.id) changed.add(item.message.id);
      for (const item of record.labelsRemoved ?? [])
        if (item.message?.id) changed.add(item.message.id);
      for (const item of record.messagesDeleted ?? []) {
        if (item.message?.id) {
          deleted.add(item.message.id);
          changed.delete(item.message.id);
        }
      }
    }
    const results = await mapConcurrent([...changed], 10, (id) =>
      this.getMessage(id, input.signal),
    );
    const failed = results.find(
      (result) => !result.ok && result.error.code !== 'GMAIL_HTTP_404',
    );
    if (failed && !failed.ok) return failed;
    const historyId = history.value.nextPageToken
      ? cursor.historyId
      : (history.value.historyId ?? cursor.historyId);
    const capturedAt = history.value.nextPageToken
      ? cursor.capturedAt
      : new Date().toISOString();
    return {
      ok: true,
      value: {
        messages: results.flatMap((result) =>
          result.ok ? [result.value] : [],
        ),
        deletedProviderMessageIds: [...deleted],
        nextCursor: gmailCursor(
          historyId,
          history.value.nextPageToken,
          capturedAt,
        ),
        hasMore: Boolean(history.value.nextPageToken),
      },
    };
  }

  private async listRecoveryChanges(
    cursor: GmailCursorValue,
    input: MailProviderListChangesInput,
  ): Promise<MailProviderResult<MailProviderChangePage>> {
    const recoveryAfter =
      cursor.recoveryAfter ?? recoveryStart(cursor.capturedAt);
    const page = await this.listMessages({
      receivedAfter: recoveryAfter,
      cursor: cursor.recoveryPageToken,
      limit: input.limit,
      signal: input.signal,
    });
    if (!page.ok) return page;
    if (page.value.nextCursor) {
      return {
        ok: true,
        value: {
          messages: page.value.messages,
          deletedProviderMessageIds: [],
          nextCursor: gmailRecoveryCursor(
            cursor.historyId,
            cursor.capturedAt,
            recoveryAfter,
            page.value.nextCursor,
          ),
          hasMore: true,
        },
      };
    }
    const nextCursor = await this.getCurrentSyncCursor(input.signal);
    if (!nextCursor.ok) return nextCursor;
    return {
      ok: true,
      value: {
        messages: page.value.messages,
        deletedProviderMessageIds: [],
        nextCursor: nextCursor.value,
        hasMore: false,
      },
    };
  }

  public async getMessage(
    providerMessageId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<NormalizedMailMessage>> {
    const message = await this.request<GmailMessageResource>(
      `/users/me/messages/${encodeURIComponent(providerMessageId)}?format=full`,
      { signal },
    );
    return message.ok ? normalizeMessage(message.value) : message;
  }

  public async getAttachment(
    providerMessageId: string,
    providerAttachmentId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<MailAttachmentContent>> {
    const result = await this.request<{ data?: string; size?: number }>(
      `/users/me/messages/${encodeURIComponent(providerMessageId)}/attachments/${encodeURIComponent(providerAttachmentId)}`,
      { signal },
    );
    if (!result.ok) return result;
    const bytes = decodeBase64Url(result.value.data ?? '');
    return {
      ok: true,
      value: {
        fileName: providerAttachmentId,
        contentType: 'application/octet-stream',
        size: result.value.size ?? bytes.byteLength,
        stream: new Blob([bytes]).stream(),
      },
    };
  }

  public async sendMessage(
    input: MailProviderSendInput,
  ): Promise<MailProviderSendResult> {
    let accessToken: string;
    try {
      accessToken = await this.accessToken(input.signal);
    } catch (error) {
      return {
        status: 'failed',
        error: errorResult(error, 'GMAIL_AUTHORIZATION_FAILED'),
      };
    }
    try {
      const prepared = await this.prepareForward(input);
      if (!prepared.ok) {
        return { status: 'failed', error: prepared.error };
      }
      input = prepared.value;
      if (input.message.draftProviderMessageId) {
        const resolvedDraftId = await this.resolveDraftId(
          input.message.draftProviderMessageId,
          input.message.draftProviderDraftId,
          input.signal,
        );
        if (!resolvedDraftId.ok) {
          return { status: 'failed', error: resolvedDraftId.error };
        }
        const updated = await this.updateDraft(resolvedDraftId.value, input);
        if (!updated.ok) return { status: 'failed', error: updated.error };
        const response = await fetch(
          `${apiBase(this.config)}/users/me/drafts/send`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${accessToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ id: resolvedDraftId.value }),
            signal: input.signal,
          },
        );
        if (!response.ok) {
          return {
            status: 'failed',
            error: await responseError('GMAIL', response),
          };
        }
        const value = (await response.json()) as GmailMessageResource;
        return { status: 'accepted', providerMessageId: value.id };
      }
      const response = await fetch(
        `${apiBase(this.config)}/users/me/messages/send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            raw: await buildMime(input),
            ...(input.message.providerConversationId
              ? { threadId: input.message.providerConversationId }
              : {}),
          }),
          signal: input.signal,
        },
      );
      if (!response.ok)
        return {
          status: 'failed',
          error: await responseError('GMAIL', response),
        };
      const value = (await response.json()) as GmailMessageResource;
      return { status: 'accepted', providerMessageId: value.id };
    } catch (error) {
      return {
        status: 'submission_unknown',
        error: unknownError(error, 'GMAIL_SEND_RESULT_UNKNOWN'),
      };
    }
  }

  public async saveDraft(
    input: MailProviderSendInput,
  ): Promise<MailProviderResult<NormalizedMailMessage>> {
    let accessToken: string;
    try {
      accessToken = await this.accessToken(input.signal);
    } catch (error) {
      return {
        ok: false,
        error: errorResult(error, 'GMAIL_AUTHORIZATION_FAILED'),
      };
    }
    try {
      const prepared = await this.prepareForward(input);
      if (!prepared.ok) return prepared;
      input = prepared.value;
      const response = await fetch(`${apiBase(this.config)}/users/me/drafts`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            raw: await buildMime(input),
            ...(input.message.providerConversationId
              ? { threadId: input.message.providerConversationId }
              : {}),
          },
        }),
        signal: input.signal,
      });
      if (!response.ok) {
        return { ok: false, error: await responseError('GMAIL', response) };
      }
      const value = (await response.json()) as GmailDraftResource;
      const providerMessageId = required(
        value.message?.id,
        'Gmail draft message ID',
      );
      const saved = input.message.attachments.length
        ? await this.getMessage(providerMessageId, input.signal)
        : undefined;
      if (saved && !saved.ok) return saved;
      return {
        ok: true,
        value: {
          ...(saved?.ok
            ? saved.value
            : normalizedDraft(input, providerMessageId)),
          providerDraftId: required(value.id, 'Gmail draft ID'),
          providerConversationId:
            value.message?.threadId ?? input.message.providerConversationId,
          providerFolderIds: ['DRAFT'],
          read: true,
          draft: true,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: unknownError(error, 'GMAIL_DRAFT_SAVE_FAILED'),
      };
    }
  }

  public async updateDraft(
    providerDraftId: string,
    input: MailProviderSendInput,
  ): Promise<MailProviderResult<NormalizedMailMessage>> {
    const resolvedDraftId = await this.resolveDraftId(
      input.message.draftProviderMessageId ?? providerDraftId,
      input.message.draftProviderDraftId,
      input.signal,
    );
    if (!resolvedDraftId.ok) return resolvedDraftId;
    providerDraftId = resolvedDraftId.value;
    const existing = input.message.draftProviderMessageId
      ? await this.getMessage(
          input.message.draftProviderMessageId,
          input.signal,
        )
      : undefined;
    if (existing && !existing.ok) return existing;
    const retained = new Set(input.message.retainedProviderAttachmentIds ?? []);
    const preservedAttachments = existing?.ok
      ? existing.value.attachments
          .filter((attachment) => retained.has(attachment.providerAttachmentId))
          .map((attachment) => ({
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            size: attachment.size,
            contentId: attachment.contentId,
            inline: attachment.inline,
            open: async () => {
              const content = await this.getAttachment(
                existing.value.providerMessageId,
                attachment.providerAttachmentId,
                input.signal,
              );
              if (!content.ok) throw new ProviderRequestError(content.error);
              return content.value.stream;
            },
          }))
      : [];
    const message = {
      ...input.message,
      attachments: [...preservedAttachments, ...input.message.attachments],
    };
    const result = await this.request<GmailDraftResource>(
      `/users/me/drafts/${encodeURIComponent(providerDraftId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: providerDraftId,
          message: {
            raw: await buildMime({ ...input, message }),
            ...(input.message.providerConversationId
              ? { threadId: input.message.providerConversationId }
              : {}),
          },
        }),
        signal: input.signal,
      },
    );
    if (!result.ok) return result;
    const providerMessageId = required(
      result.value.message?.id,
      'Gmail draft message ID',
    );
    const saved =
      input.message.attachments.length || input.message.draftProviderMessageId
        ? await this.getMessage(providerMessageId, input.signal)
        : undefined;
    if (saved && !saved.ok) return saved;
    return {
      ok: true,
      value: {
        ...(saved?.ok
          ? saved.value
          : normalizedDraft(input, providerMessageId)),
        providerDraftId,
        providerConversationId:
          result.value.message?.threadId ??
          input.message.providerConversationId,
        providerFolderIds: ['DRAFT'],
        read: true,
        draft: true,
      },
    };
  }

  private async prepareForward(
    input: MailProviderSendInput,
  ): Promise<MailProviderResult<MailProviderSendInput>> {
    const sourceId = input.message.forwardOfProviderMessageId;
    if (!sourceId) return { ok: true, value: input };
    const source = await this.getMessage(sourceId, input.signal);
    if (!source.ok) return source;
    const forwardedAttachments = source.value.attachments.map((attachment) => ({
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
      contentId: attachment.contentId,
      inline: attachment.inline,
      open: async () => {
        const content = await this.getAttachment(
          source.value.providerMessageId,
          attachment.providerAttachmentId,
          input.signal,
        );
        if (!content.ok) throw new ProviderRequestError(content.error);
        return content.value.stream;
      },
    }));
    const attachmentSize = [
      ...forwardedAttachments,
      ...input.message.attachments,
    ].reduce((total, attachment) => total + attachment.size, 0);
    if (attachmentSize > 25 * 1024 * 1024) {
      return failure(
        'GMAIL_FORWARD_ATTACHMENTS_TOO_LARGE',
        'Forwarded attachments exceed the 25 MB message limit.',
        'content',
        false,
      );
    }
    const text = forwardedText(input.message.text, source.value);
    const html = forwardedHtml(
      input.message.html,
      input.message.text,
      source.value,
    );
    return {
      ok: true,
      value: {
        ...input,
        message: {
          ...input.message,
          text,
          html,
          attachments: [...input.message.attachments, ...forwardedAttachments],
          forwardOfProviderMessageId: undefined,
        },
      },
    };
  }

  private async resolveDraftId(
    providerMessageId: string,
    providerDraftId: string | undefined,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<string>> {
    if (providerDraftId) return { ok: true, value: providerDraftId };
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ maxResults: '500' });
      if (pageToken) query.set('pageToken', pageToken);
      const page = await this.request<GmailDraftList>(
        `/users/me/drafts?${query.toString()}`,
        { signal },
      );
      if (!page.ok) return page;
      const match = page.value.drafts?.find(
        (draft) => draft.message?.id === providerMessageId,
      );
      if (match?.id) return { ok: true, value: match.id };
      pageToken = page.value.nextPageToken;
    } while (pageToken);
    return failure(
      'GMAIL_DRAFT_NOT_FOUND',
      'Gmail draft was not found.',
      'provider',
      false,
    );
  }

  public setRead(
    providerMessageId: string,
    read: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    return this.modifyLabels(
      providerMessageId,
      read ? [] : ['UNREAD'],
      read ? ['UNREAD'] : [],
      signal,
    );
  }

  public setStarred(
    providerMessageId: string,
    starred: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    return this.modifyLabels(
      providerMessageId,
      starred ? ['STARRED'] : [],
      starred ? [] : ['STARRED'],
      signal,
    );
  }

  public async moveMessage(
    providerMessageId: string,
    providerFolderId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<{ readonly providerMessageId: string }>> {
    const archive = providerFolderId === '__archive__';
    const result = await this.modifyLabels(
      providerMessageId,
      archive ? [] : [providerFolderId],
      ['INBOX', 'TRASH', 'SPAM'].filter((label) => label !== providerFolderId),
      signal,
    );
    return result.ok ? { ok: true, value: { providerMessageId } } : result;
  }

  public deleteMessage(
    providerMessageId: string,
    permanently: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    return permanently
      ? this.emptyRequest(
          `/users/me/messages/${encodeURIComponent(providerMessageId)}`,
          { method: 'DELETE', signal },
        )
      : this.emptyRequest(
          `/users/me/messages/${encodeURIComponent(providerMessageId)}/trash`,
          { method: 'POST', signal },
        );
  }

  private async modifyLabels(
    providerMessageId: string,
    addLabelIds: readonly string[],
    removeLabelIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    return this.emptyRequest(
      `/users/me/messages/${encodeURIComponent(providerMessageId)}/modify`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ addLabelIds, removeLabelIds }),
        signal,
      },
    );
  }

  private async emptyRequest(
    path: string,
    init: RequestInit,
  ): Promise<MailProviderResult<void>> {
    try {
      const response = await fetch(`${apiBase(this.config)}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${await this.accessToken(init.signal ?? undefined)}`,
          ...init.headers,
        },
      });
      return response.ok
        ? { ok: true, value: undefined }
        : { ok: false, error: await responseError('GMAIL', response) };
    } catch (error) {
      return {
        ok: false,
        error: errorResult(error, 'GMAIL_MESSAGE_MUTATION_FAILED'),
      };
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit,
  ): Promise<MailProviderResult<T>> {
    try {
      return await gmailRequest<T>(
        this.config,
        await this.accessToken(init.signal ?? undefined),
        path,
        init,
      );
    } catch (error) {
      return { ok: false, error: errorResult(error, 'GMAIL_REQUEST_FAILED') };
    }
  }

  private async accessToken(signal?: AbortSignal): Promise<string> {
    const credential = await this.context.credentials.get<GmailCredential>(
      this.account.credentialReference,
    );
    if (Date.parse(credential.expiresAt) > Date.now() + 60_000)
      return credential.accessToken;
    const refreshed = await exchangeToken(
      this.config,
      {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: credential.refreshToken,
        grant_type: 'refresh_token',
      },
      signal,
    );
    if (!refreshed.ok) throw new ProviderRequestError(refreshed.error);
    const next: GmailCredential = {
      ...credential,
      accessToken: required(refreshed.value.access_token, 'Gmail access token'),
      refreshToken: refreshed.value.refresh_token ?? credential.refreshToken,
      expiresAt: expiry(refreshed.value.expires_in),
      scopes: splitScopes(refreshed.value.scope, credential.scopes),
      tokenType: refreshed.value.token_type ?? credential.tokenType,
    };
    await this.context.credentials.replace(
      this.account.credentialReference,
      next,
    );
    return next.accessToken;
  }
}

async function exchangeToken(
  config: GmailMailProviderConfig,
  body: Record<string, string>,
  signal?: AbortSignal,
): Promise<MailProviderResult<GmailTokenResponse>> {
  try {
    const response = await fetch(
      config.tokenEndpoint ?? 'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
        signal,
      },
    );
    const value = (await response.json()) as GmailTokenResponse;
    return response.ok
      ? { ok: true, value }
      : failure(
          `GMAIL_OAUTH_${value.error ?? response.status}`,
          value.error_description ?? 'Gmail OAuth token exchange failed.',
          'authentication',
          false,
        );
  } catch (error) {
    return {
      ok: false,
      error: unknownError(error, 'GMAIL_OAUTH_REQUEST_FAILED'),
    };
  }
}

async function gmailRequest<T>(
  config: GmailMailProviderConfig,
  accessToken: string,
  path: string,
  init: RequestInit,
): Promise<MailProviderResult<T>> {
  try {
    const response = await fetch(`${apiBase(config)}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
    });
    return response.ok
      ? { ok: true, value: (await response.json()) as T }
      : { ok: false, error: await responseError('GMAIL', response) };
  } catch (error) {
    return { ok: false, error: unknownError(error, 'GMAIL_REQUEST_FAILED') };
  }
}

function apiBase(config: GmailMailProviderConfig): string {
  return (config.apiBaseUrl ?? 'https://gmail.googleapis.com/gmail/v1').replace(
    /\/$/,
    '',
  );
}

function normalizeMessage(
  message: GmailMessageResource,
): MailProviderResult<NormalizedMailMessage> {
  if (!message.id)
    return failure(
      'GMAIL_MESSAGE_INVALID',
      'Gmail message did not include an ID.',
      'provider',
      false,
    );
  const headers = new Map(
    (message.payload?.headers ?? []).flatMap((header) =>
      header.name && header.value
        ? [[header.name.toLowerCase(), header.value] as const]
        : [],
    ),
  );
  const content = collectParts(message.payload);
  return {
    ok: true,
    value: {
      providerMessageId: message.id,
      internetMessageId: headers.get('message-id'),
      providerConversationId: message.threadId,
      providerFolderIds: gmailFolderIds(message.labelIds ?? []),
      from: parseAddresses(headers.get('from'))[0],
      to: parseAddresses(headers.get('to')),
      cc: parseAddresses(headers.get('cc')),
      bcc: parseAddresses(headers.get('bcc')),
      replyTo: parseAddresses(headers.get('reply-to')),
      inReplyTo: headers.get('in-reply-to'),
      references: headers.get('references')?.split(/\s+/).filter(Boolean) ?? [],
      subject: headers.get('subject') ?? '',
      preview: message.snippet,
      text: content.text,
      html: content.html,
      receivedAt: timestamp(message.internalDate),
      sentAt: timestamp(Date.parse(headers.get('date') ?? '')),
      read: !(message.labelIds ?? []).includes('UNREAD'),
      starred: (message.labelIds ?? []).includes('STARRED'),
      draft: (message.labelIds ?? []).includes('DRAFT'),
      attachments: content.attachments,
    },
  };
}

function collectParts(part: GmailPart | undefined): {
  text?: string;
  html?: string;
  attachments: readonly NormalizedMailAttachment[];
} {
  let text: string | undefined;
  let html: string | undefined;
  const attachments: NormalizedMailAttachment[] = [];
  const visit = (current: GmailPart | undefined): void => {
    if (!current) return;
    const disposition =
      headerValue(current.headers, 'content-disposition') ?? '';
    if (current.body?.attachmentId || current.filename) {
      attachments.push({
        providerAttachmentId:
          current.body?.attachmentId ?? current.partId ?? '',
        fileName: current.filename ?? '',
        contentType: current.mimeType ?? 'application/octet-stream',
        size: current.body?.size ?? 0,
        contentId: headerValue(current.headers, 'content-id'),
        inline: /^inline/i.test(disposition),
      });
    } else if (
      current.body?.data &&
      current.mimeType === 'text/plain' &&
      text === undefined
    ) {
      text = new TextDecoder().decode(decodeBase64Url(current.body.data));
    } else if (
      current.body?.data &&
      current.mimeType === 'text/html' &&
      html === undefined
    ) {
      html = new TextDecoder().decode(decodeBase64Url(current.body.data));
    }
    current.parts?.forEach(visit);
  };
  visit(part);
  return { text, html, attachments };
}

function gmailFolderIds(labelIds: readonly string[]): readonly string[] {
  const archived = !['INBOX', 'TRASH', 'SPAM', 'SENT', 'DRAFT'].some((label) =>
    labelIds.includes(label),
  );
  return archived ? [...labelIds, '__archive__'] : labelIds;
}

function normalizedDraft(
  input: MailProviderSendInput,
  providerMessageId: string,
): NormalizedMailMessage {
  return {
    providerMessageId,
    providerConversationId: input.message.providerConversationId,
    providerFolderIds: ['DRAFT'],
    from: input.identity,
    to: input.message.to,
    cc: input.message.cc,
    bcc: input.message.bcc,
    replyTo: [],
    inReplyTo: input.message.inReplyTo,
    references: input.message.references,
    subject: input.message.subject,
    text: input.message.text,
    html: input.message.html,
    read: true,
    starred: false,
    draft: true,
    attachments: [],
  };
}

async function buildMime(input: MailProviderSendInput): Promise<string> {
  const headers = [
    `From: ${formatAddress(input.identity)}`,
    `To: ${input.message.to.map(formatAddress).join(', ')}`,
    ...(input.message.cc.length
      ? [`Cc: ${input.message.cc.map(formatAddress).join(', ')}`]
      : []),
    ...(input.message.bcc.length
      ? [`Bcc: ${input.message.bcc.map(formatAddress).join(', ')}`]
      : []),
    `Subject: ${encodeHeader(input.message.subject)}`,
    ...(input.message.inReplyTo
      ? [`In-Reply-To: ${cleanHeader(input.message.inReplyTo)}`]
      : []),
    ...(input.message.references.length
      ? [`References: ${input.message.references.map(cleanHeader).join(' ')}`]
      : []),
    'MIME-Version: 1.0',
  ];
  const token = input.trackingId.replace(/[^a-zA-Z0-9]/g, '') || 'message';
  const alternativeBoundary = `${token}-alternative`;
  const alternativeBody = input.message.html
    ? multipartAlternativeBody(
        input.message.text,
        input.message.html,
        alternativeBoundary,
      )
    : undefined;
  let body: string;
  if (input.message.attachments.length > 0) {
    const boundary = `nocobase-${token}-mixed`;
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    const parts = [
      alternativeBody
        ? [
            `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
            '',
            alternativeBody,
          ].join('\r\n')
        : textPart(input.message.text),
      ...(await Promise.all(
        input.message.attachments.map(async (attachment) => {
          const bytes = await readAttachment(
            attachment.open(),
            attachment.size,
          );
          const fileName = encodeHeader(attachment.fileName);
          return [
            `Content-Type: ${cleanHeader(attachment.contentType)}; name="${fileName}"`,
            `Content-Disposition: ${attachment.inline ? 'inline' : 'attachment'}; filename="${fileName}"`,
            ...(attachment.contentId
              ? [`Content-ID: <${cleanHeader(attachment.contentId)}>`]
              : []),
            'Content-Transfer-Encoding: base64',
            '',
            wrapBase64(bytes.toString('base64')),
          ].join('\r\n');
        }),
      )),
    ];
    body = [
      ...parts.flatMap((part) => [`--${boundary}`, part]),
      `--${boundary}--`,
      '',
    ].join('\r\n');
  } else if (alternativeBody) {
    headers.push(
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    );
    body = alternativeBody;
  } else {
    headers.push(
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
    );
    body = input.message.text;
  }
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`).toString(
    'base64url',
  );
}

function multipartAlternativeBody(
  text: string,
  html: string,
  boundary: string,
): string {
  return [
    `--${boundary}`,
    textPart(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    `--${boundary}--`,
  ].join('\r\n');
}

function textPart(text: string): string {
  return [
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
  ].join('\r\n');
}

async function readAttachment(
  streamPromise: Promise<ReadableStream<Uint8Array>>,
  expectedSize: number,
): Promise<Buffer> {
  const stream = await streamPromise;
  const bytes = Buffer.from(await new Response(stream).arrayBuffer());
  if (bytes.byteLength !== expectedSize) {
    throw new Error('Mail attachment size changed before submission.');
  }
  return bytes;
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/gu)?.join('\r\n') ?? '';
}

function formatAddress(value: MailAddress): string {
  const address = cleanHeader(value.address);
  return value.name
    ? `${encodeHeader(cleanHeader(value.name))} <${address}>`
    : address;
}

function encodeHeader(value: string): string {
  const clean = cleanHeader(value);
  return /^[\x20-\x7e]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean).toString('base64')}?=`;
}

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]/g, ' ');
}

function htmlToText(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return value
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/p\s*>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .trim();
}

function forwardedText(comment: string, source: NormalizedMailMessage): string {
  const headers = [
    '---------- Forwarded message ---------',
    source.from ? `From: ${formatAddress(source.from)}` : undefined,
    (source.sentAt ?? source.receivedAt)
      ? `Date: ${source.sentAt ?? source.receivedAt}`
      : undefined,
    `Subject: ${source.subject}`,
    source.to.length
      ? `To: ${source.to.map(formatAddress).join(', ')}`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  const body = source.text ?? htmlToText(source.html) ?? source.preview ?? '';
  return [comment.trimEnd(), '', ...headers, '', body].join('\n');
}

function forwardedHtml(
  commentHtml: string | undefined,
  commentText: string,
  source: NormalizedMailMessage,
): string {
  const comment = commentHtml ?? escapeHtmlBody(commentText);
  const sourceBody =
    source.html ?? escapeHtmlBody(source.text ?? source.preview ?? '');
  const metadata = [
    source.from
      ? `<b>From:</b> ${escapeHtmlBody(formatAddress(source.from))}`
      : undefined,
    (source.sentAt ?? source.receivedAt)
      ? `<b>Date:</b> ${escapeHtmlBody(source.sentAt ?? source.receivedAt ?? '')}`
      : undefined,
    `<b>Subject:</b> ${escapeHtmlBody(source.subject)}`,
    source.to.length
      ? `<b>To:</b> ${escapeHtmlBody(source.to.map(formatAddress).join(', '))}`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  return `${comment}<br><br><div class="gmail_quote"><div>---------- Forwarded message ---------</div>${metadata.join('<br>')}<br><br>${sourceBody}</div>`;
}

function escapeHtmlBody(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
    .replace(/\n/gu, '<br>');
}

function parseAddresses(value: string | undefined): readonly MailAddress[] {
  if (!value) return [];
  return value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).flatMap((entry) => {
    const match = entry.trim().match(/^(?:"?(.+?)"?\s*)?<([^>]+)>$/);
    const address = (match?.[2] ?? entry).trim();
    return address ? [{ address, name: match?.[1]?.trim() }] : [];
  });
}

function headerValue(
  headers: readonly GmailHeader[] | undefined,
  name: string,
): string | undefined {
  return headers?.find((header) => header.name?.toLowerCase() === name)?.value;
}

function gmailCursor(
  historyId: string,
  pageToken?: string,
  capturedAt?: string,
): MailSyncCursor {
  return {
    value: {
      historyId,
      ...(pageToken ? { pageToken } : {}),
      ...(capturedAt ? { capturedAt } : {}),
    },
    version: 'gmail-v1',
  };
}

function gmailRecoveryCursor(
  historyId: string,
  capturedAt: string | undefined,
  recoveryAfter: string,
  recoveryPageToken: string,
): MailSyncCursor {
  return {
    value: {
      historyId,
      ...(capturedAt ? { capturedAt } : {}),
      recoveryAfter,
      recoveryPageToken,
    },
    version: 'gmail-v1',
  };
}

function parseGmailCursor(
  cursor: MailSyncCursor | undefined,
): GmailCursorValue | undefined {
  const value = cursor?.value;
  return value &&
    typeof value === 'object' &&
    typeof value.historyId === 'string'
    ? {
        historyId: value.historyId,
        pageToken:
          typeof value.pageToken === 'string' ? value.pageToken : undefined,
        capturedAt:
          typeof value.capturedAt === 'string' ? value.capturedAt : undefined,
        recoveryAfter:
          typeof value.recoveryAfter === 'string'
            ? value.recoveryAfter
            : undefined,
        recoveryPageToken:
          typeof value.recoveryPageToken === 'string'
            ? value.recoveryPageToken
            : undefined,
      }
    : undefined;
}

function recoveryStart(capturedAt: string | undefined): string {
  const capturedTime = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  const start = Number.isFinite(capturedTime)
    ? capturedTime - 1_000
    : Date.now() - 7 * 24 * 60 * 60 * 1_000;
  return new Date(start).toISOString();
}

function gmailFolderType(id: string): NormalizedMailFolder['type'] {
  return (
    (
      {
        INBOX: 'inbox',
        SENT: 'sent',
        DRAFT: 'drafts',
        TRASH: 'trash',
        SPAM: 'junk',
      } as const
    )[id as 'INBOX'] ?? 'custom'
  );
}

function timestamp(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const numeric =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  const date = new Date(numeric);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function decodeBase64Url(value: string): Uint8Array {
  return Buffer.from(value, 'base64url');
}

function splitScopes(
  value: string | undefined,
  fallback: readonly string[],
): readonly string[] {
  return value?.split(/\s+/).filter(Boolean) ?? fallback;
}

function expiry(seconds: number | undefined): string {
  return new Date(Date.now() + (seconds ?? 3600) * 1000).toISOString();
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is missing.`);
  return value;
}

async function responseError(
  prefix: string,
  response: Response,
): Promise<MailProviderError> {
  let message = `${prefix} request failed with status ${response.status}.`;
  try {
    const body = (await response.json()) as {
      error?: { message?: string } | string;
      error_description?: string;
    };
    message =
      typeof body.error === 'string'
        ? (body.error_description ?? body.error)
        : (body.error?.message ?? message);
  } catch {
    // Some Provider errors do not use a JSON response body.
  }
  const retryAfter = Number(response.headers.get('retry-after'));
  return {
    code: `${prefix}_HTTP_${response.status}`,
    message,
    category:
      response.status === 401 || response.status === 403
        ? 'authentication'
        : response.status === 429
          ? 'rate_limit'
          : response.status >= 500
            ? 'provider'
            : 'provider',
    retryable: response.status === 429 || response.status >= 500,
    retryAfterMs:
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : undefined,
  };
}

function unknownError(error: unknown, code: string): MailProviderError {
  return {
    code,
    message: error instanceof Error ? error.message : 'Gmail request failed.',
    category: 'network',
    retryable: true,
  };
}

class ProviderRequestError extends Error {
  public constructor(public readonly providerError: MailProviderError) {
    super(providerError.message);
  }
}

function errorResult(error: unknown, code: string): MailProviderError {
  return error instanceof ProviderRequestError
    ? error.providerError
    : unknownError(error, code);
}

function failure<T>(
  code: string,
  message: string,
  category: MailProviderError['category'],
  retryable: boolean,
): MailProviderResult<T> {
  return { ok: false, error: { code, message, category, retryable } };
}

function invalidPushNotification<T>(): MailProviderResult<T> {
  return failure(
    'GMAIL_PUSH_NOTIFICATION_INVALID',
    'Gmail push notification payload is invalid.',
    'provider',
    false,
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  map: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const result = new Array<R>(values.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (index < values.length) {
        const current = index++;
        result[current] = await map(values[current]);
      }
    }),
  );
  return result;
}

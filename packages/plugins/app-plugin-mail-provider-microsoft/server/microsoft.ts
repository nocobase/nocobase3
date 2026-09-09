import type {
  MailAccount,
  MailAddress,
  MailAttachmentContent,
  MailAuthorizedAccount,
  MailFolderType,
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
  NormalizedMailMessage,
} from '@nocobase/app-plugin-mail/server/types';

const DEFAULT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
] as const;

const MESSAGE_SELECT = [
  'id',
  'internetMessageId',
  'conversationId',
  'parentFolderId',
  'from',
  'toRecipients',
  'ccRecipients',
  'bccRecipients',
  'replyTo',
  'subject',
  'bodyPreview',
  'body',
  'receivedDateTime',
  'sentDateTime',
  'isRead',
  'isDraft',
  'flag',
  'hasAttachments',
].join(',');

const SIMPLE_ATTACHMENT_LIMIT = 3 * 1024 * 1024;
const UPLOAD_CHUNK_SIZE = 10 * 320 * 1024;

export interface MicrosoftMailProviderConfig extends MailProviderConfig {
  readonly type: 'microsoft';
  readonly clientId: string;
  readonly clientSecret: string;
  readonly tenant?: string;
  readonly scopes?: readonly string[];
  readonly authorityBaseUrl?: string;
  readonly graphBaseUrl?: string;
}

interface MicrosoftCredential {
  readonly provider: 'microsoft';
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
  readonly scopes: readonly string[];
  readonly tokenType: string;
}

interface MicrosoftTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GraphEmailAddress {
  emailAddress?: { name?: string; address?: string };
}

interface GraphMessage {
  id?: string;
  internetMessageId?: string;
  conversationId?: string;
  parentFolderId?: string;
  from?: GraphEmailAddress;
  toRecipients?: readonly GraphEmailAddress[];
  ccRecipients?: readonly GraphEmailAddress[];
  bccRecipients?: readonly GraphEmailAddress[];
  replyTo?: readonly GraphEmailAddress[];
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  isDraft?: boolean;
  hasAttachments?: boolean;
  flag?: { flagStatus?: string };
  '@removed'?: { reason?: string };
}

interface GraphPage<T> {
  value?: readonly T[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

interface GraphFolder {
  id?: string;
  displayName?: string;
  childFolderCount?: number;
  unreadItemCount?: number;
}

interface GraphProfile {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  proxyAddresses?: readonly string[];
}

interface GraphAttachment {
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentId?: string;
  contentBytes?: string;
}

interface GraphSubscription {
  id?: string;
  expirationDateTime?: string;
}

interface GraphUploadSession {
  readonly uploadUrl?: string;
}

interface FolderCursor {
  readonly pending: readonly string[];
  readonly providerFolderIds: readonly string[];
}

interface InitialCursor {
  readonly phase: 'baseline' | 'history';
  readonly folders: readonly string[];
  readonly folderIndex: number;
  readonly checkpoints: Readonly<Record<string, string>>;
  readonly nextLink?: string;
  readonly receivedAfter?: string;
}

interface ChangeCursor {
  readonly checkpoints: Readonly<Record<string, string>>;
  readonly folders?: readonly string[];
  readonly folderIndex?: number;
  readonly nextLink?: string;
}

export const microsoftMailProviderDefinition: MailProviderDefinition<MicrosoftMailProviderConfig> =
  {
    type: 'microsoft',
    label: 'Microsoft 365',
    capabilities: {
      receive: true,
      send: true,
      incrementalSync: true,
      pushNotifications: true,
      folders: true,
      labels: false,
      drafts: true,
      moveMessage: true,
      aliases: true,
    },
    validateConfig(config: MicrosoftMailProviderConfig): void {
      if (!config.clientId || !config.clientSecret) {
        throw new Error(
          'Microsoft OAuth clientId and clientSecret are required.',
        );
      }
    },
    authorization: createAuthorization(),
    push: {
      parse(input) {
        const validationToken = input.query.validationToken;
        if (validationToken !== undefined) {
          return {
            ok: true,
            value: { challengeResponse: validationToken, notifications: [] },
          };
        }
        const value = record(input.body).value;
        if (!Array.isArray(value)) return invalidPushNotification();
        const notifications = value.flatMap((item) => {
          const notification = record(item);
          return typeof notification.subscriptionId === 'string' &&
            typeof notification.clientState === 'string'
            ? [
                {
                  providerSubscriptionId: notification.subscriptionId,
                  clientState: notification.clientState,
                },
              ]
            : [];
        });
        return notifications.length === value.length
          ? { ok: true, value: { notifications } }
          : invalidPushNotification();
      },
    },
    async createAdapter(
      context,
      config,
      account,
    ): Promise<MailProviderAdapter> {
      return new MicrosoftMailProviderAdapter(context, config, account);
    },
  };

function createAuthorization(): MailProviderAuthorization<MicrosoftMailProviderConfig> {
  return {
    async start(_context, config, input) {
      const allowedScopes: readonly string[] = config.scopes ?? DEFAULT_SCOPES;
      const scopes = input.scopes?.length ? input.scopes : allowedScopes;
      if (scopes.some((scope) => !allowedScopes.includes(scope))) {
        return failure(
          'MICROSOFT_SCOPE_NOT_ALLOWED',
          'Requested Microsoft OAuth scopes are not allowed by Provider configuration.',
          'configuration',
          false,
        );
      }
      const url = new URL(`${authority(config)}/oauth2/v2.0/authorize`);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: input.redirectUri,
        response_type: 'code',
        response_mode: 'query',
        scope: scopes.join(' '),
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
          scope: (input.scopes.length
            ? input.scopes
            : (config.scopes ?? DEFAULT_SCOPES)
          ).join(' '),
        },
        input.signal,
      );
      if (!token.ok) return token;
      if (!token.value.refresh_token) {
        return failure(
          'MICROSOFT_REFRESH_TOKEN_MISSING',
          'Microsoft did not return an offline refresh token.',
          'authentication',
          false,
        );
      }
      const accessToken = required(
        token.value.access_token,
        'Microsoft access token',
      );
      const profile = await graphRequest<GraphProfile>(
        config,
        accessToken,
        '/me?$select=id,displayName,mail,userPrincipalName,proxyAddresses',
        { signal: input.signal },
      );
      if (!profile.ok) return profile;
      const address = profile.value.mail ?? profile.value.userPrincipalName;
      if (!address)
        return failure(
          'MICROSOFT_PROFILE_INVALID',
          'Microsoft profile did not include a mailbox address.',
          'provider',
          false,
        );
      const authorizationSubject = profile.value.id;
      if (!authorizationSubject)
        return failure(
          'MICROSOFT_PROFILE_INVALID',
          'Microsoft profile did not include a stable account ID.',
          'provider',
          false,
        );
      const expiresAt = expiry(token.value.expires_in);
      const scopes = splitScopes(
        token.value.scope,
        config.scopes ?? DEFAULT_SCOPES,
      );
      const credentialReference = await context.credentials.put({
        provider: 'microsoft',
        accessToken,
        refreshToken: token.value.refresh_token,
        expiresAt,
        scopes,
        tokenType: token.value.token_type ?? 'Bearer',
      } satisfies MicrosoftCredential);
      return {
        ok: true,
        value: {
          address,
          displayName: profile.value.displayName,
          authorizationSubject,
          credentialReference,
          scopes,
          identities: microsoftIdentities(profile.value, address),
        } satisfies MailAuthorizedAccount,
      };
    },
  };
}

export class MicrosoftMailProviderAdapter implements MailProviderAdapter {
  public readonly identity: MailAccount['provider'];
  public readonly capabilities: MailProviderDefinition['capabilities'] =
    microsoftMailProviderDefinition.capabilities;

  public constructor(
    private readonly context: MailProviderContext,
    private readonly config: MicrosoftMailProviderConfig,
    private readonly account: MailAccount,
  ) {
    this.identity = account.provider;
  }

  public async upsertPushSubscription(
    input: MailProviderUpsertPushSubscriptionInput,
  ): Promise<MailProviderResult<MailProviderUpsertPushSubscriptionResult>> {
    const expirationDateTime = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    let fallbackSubscriptionId = input.providerSubscriptionId;
    let result = input.providerSubscriptionId
      ? await this.request<GraphSubscription>(
          `/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ expirationDateTime }),
            signal: input.signal,
          },
        )
      : undefined;
    if (
      !result ||
      (!result.ok &&
        ['MICROSOFT_HTTP_404', 'MICROSOFT_HTTP_410'].includes(
          result.error.code,
        ))
    ) {
      fallbackSubscriptionId = undefined;
      result = await this.request<GraphSubscription>('/subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          changeType: 'created,updated,deleted',
          notificationUrl: input.notificationUrl,
          resource: 'me/messages',
          expirationDateTime,
          clientState: input.clientState,
          latestSupportedTlsVersion: 'v1_2',
        }),
        signal: input.signal,
      });
    }
    if (!result.ok) return result;
    const id = result.value.id ?? fallbackSubscriptionId;
    const expiresAt = result.value.expirationDateTime ?? expirationDateTime;
    if (!id || Number.isNaN(Date.parse(expiresAt))) {
      return failure(
        'MICROSOFT_PUSH_SUBSCRIPTION_INVALID',
        'Microsoft Graph did not return a valid push subscription.',
        'provider',
        false,
      );
    }
    return {
      ok: true,
      value: {
        providerSubscriptionId: id,
        renewAfter: new Date(
          Date.parse(expiresAt) - 12 * 60 * 60 * 1000,
        ).toISOString(),
        expiresAt,
      },
    };
  }

  public async deletePushSubscription(
    providerSubscriptionId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    try {
      const resolvedUrl = resolveGraphUrl(
        this.config,
        `/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
      );
      if (!resolvedUrl.ok) return resolvedUrl;
      const response = await fetch(resolvedUrl.value, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${await this.accessToken(signal)}`,
          accept: 'application/json',
        },
        signal,
      });
      return response.ok || [404, 410].includes(response.status)
        ? { ok: true, value: undefined }
        : { ok: false, error: await responseError(response) };
    } catch (error) {
      return {
        ok: false,
        error: errorResult(error, 'MICROSOFT_PUSH_DELETE_FAILED'),
      };
    }
  }

  public getCurrentSyncCursor(): Promise<MailProviderResult<MailSyncCursor>> {
    return Promise.resolve({
      ok: true,
      value: graphCursor({ checkpoints: {}, folders: [] }),
    });
  }

  public async listFolders(
    input: MailProviderListFoldersInput,
  ): Promise<MailProviderResult<MailProviderFolderPage>> {
    const decoded = input.cursor ? decodeFolderCursor(input.cursor) : undefined;
    if (input.cursor && !decoded) return invalidSyncCursor();
    const cursor: FolderCursor = decoded ?? {
      pending: ['/me/mailFolders?includeHiddenFolders=true&$top=100'],
      providerFolderIds: [],
    };
    const [url, ...remaining] = cursor.pending;
    if (!url) {
      return {
        ok: true,
        value: {
          folders: [],
          completeProviderFolderIds: cursor.providerFolderIds,
        },
      };
    }
    const page = await this.request<GraphPage<GraphFolder>>(url, {
      signal: input.signal,
    });
    if (!page.ok) return page;
    const folders = (page.value.value ?? []).map((folder) => ({
      providerFolderId: required(folder.id, 'Microsoft folder ID'),
      type: graphFolderType(folder.displayName),
      name: folder.displayName ?? '',
      unreadCount: folder.unreadItemCount,
      kind: 'folder' as const,
    }));
    const childUrls = (page.value.value ?? []).flatMap((folder) =>
      (folder.childFolderCount ?? 0) > 0 && folder.id
        ? [
            `/me/mailFolders/${encodeURIComponent(folder.id)}/childFolders?includeHiddenFolders=true&$top=100`,
          ]
        : [],
    );
    const pending = [
      ...(page.value['@odata.nextLink'] ? [page.value['@odata.nextLink']] : []),
      ...remaining,
      ...childUrls,
    ];
    const providerFolderIds = uniqueStrings([
      ...cursor.providerFolderIds,
      ...folders.map((folder) => folder.providerFolderId),
    ]);
    return {
      ok: true,
      value: {
        folders,
        nextCursor:
          pending.length > 0
            ? encode({ pending, providerFolderIds } satisfies FolderCursor)
            : undefined,
        completeProviderFolderIds:
          pending.length === 0 ? providerFolderIds : undefined,
      },
    };
  }

  public reconcileSyncCursor(
    syncCursor: MailSyncCursor | undefined,
    providerFolderIds: readonly string[],
  ): MailProviderResult<MailSyncCursor> {
    const cursor = parseGraphCursor(syncCursor);
    if (!cursor && syncCursor) {
      return failure(
        'MICROSOFT_SYNC_CURSOR_INVALID',
        'Microsoft sync cursor is invalid.',
        'provider',
        false,
      );
    }
    const folders = uniqueStrings(providerFolderIds);
    const checkpoints = Object.fromEntries(
      Object.entries(cursor?.checkpoints ?? {}).filter(([folderId]) =>
        folders.includes(folderId),
      ),
    );
    return {
      ok: true,
      value: graphCursor({
        checkpoints,
        folders,
        folderIndex: 0,
      }),
    };
  }

  public async listMessages(
    input: MailProviderListMessagesInput,
  ): Promise<MailProviderResult<MailProviderMessagePage>> {
    let cursor: InitialCursor | undefined;
    if (input.cursor) {
      cursor = decodeInitialCursor(input.cursor);
      if (!cursor) return invalidSyncCursor();
    } else {
      let folders = input.providerFolderIds ?? [];
      if (folders.length === 0) {
        const discovered = await this.listFolders({
          limit: input.limit ?? 100,
          signal: input.signal,
        });
        if (!discovered.ok) return discovered;
        if (discovered.value.nextCursor)
          return failure(
            'MICROSOFT_FOLDER_SCOPE_REQUIRED',
            'Microsoft initial sync requires the complete discovered folder scope.',
            'configuration',
            false,
          );
        folders = discovered.value.completeProviderFolderIds ?? [];
      }
      if (folders.length === 0)
        return failure(
          'MICROSOFT_FOLDER_SCOPE_REQUIRED',
          'Microsoft initial sync requires a discovered folder scope.',
          'configuration',
          false,
        );
      const baseline = parseGraphCursor(input.baselineCursor);
      cursor = {
        phase: 'baseline',
        folders,
        folderIndex: 0,
        checkpoints: baseline?.checkpoints ?? {},
        receivedAfter: input.receivedAfter,
      };
    }
    if (cursor.phase === 'baseline') {
      if (cursor.folderIndex >= cursor.folders.length) {
        return {
          ok: true,
          value: {
            messages: [],
            nextCursor: encode({
              ...cursor,
              phase: 'history',
              folderIndex: 0,
            } satisfies InitialCursor),
            syncCursor: graphCursor({
              checkpoints: cursor.checkpoints,
              folders: cursor.folders,
            }),
          },
        };
      }
      const folderId = cursor.folders[cursor.folderIndex];
      const page = await this.request<GraphPage<GraphMessage>>(
        this.latestDeltaUrl(folderId),
        { signal: input.signal },
      );
      if (!page.ok) return page;
      const deltaLink = page.value['@odata.deltaLink'];
      if (!deltaLink)
        return failure(
          'MICROSOFT_DELTA_LINK_MISSING',
          'Microsoft latest delta response did not include a checkpoint.',
          'provider',
          false,
        );
      const checkpoints = {
        ...cursor.checkpoints,
        [folderId]: deltaLink,
      };
      const folderIndex = cursor.folderIndex + 1;
      return {
        ok: true,
        value: {
          messages: [],
          nextCursor: encode({
            ...cursor,
            phase:
              folderIndex >= cursor.folders.length ? 'history' : 'baseline',
            folderIndex: folderIndex >= cursor.folders.length ? 0 : folderIndex,
            checkpoints,
          } satisfies InitialCursor),
          syncCursor: graphCursor({ checkpoints, folders: cursor.folders }),
        },
      };
    }
    if (cursor.folderIndex >= cursor.folders.length) {
      return {
        ok: true,
        value: {
          messages: [],
          syncCursor: graphCursor({
            checkpoints: cursor.checkpoints,
            folders: cursor.folders,
          }),
        },
      };
    }
    const folderId = cursor.folders[cursor.folderIndex];
    const url =
      cursor.nextLink ??
      this.messageListUrl(folderId, input.limit ?? 100, input.receivedAfter);
    const page = await this.request<GraphPage<GraphMessage>>(url, {
      signal: input.signal,
    });
    if (!page.ok) return page;
    const normalized = await this.normalizePage(
      page.value.value ?? [],
      input.signal,
    );
    if (!normalized.ok) return normalized;
    const messages = filterReceivedAfter(
      normalized.value.messages,
      cursor.receivedAfter,
    );
    const checkpoints = { ...cursor.checkpoints };
    let folderIndex = cursor.folderIndex;
    const nextLink = page.value['@odata.nextLink'];
    if (!nextLink) {
      folderIndex += 1;
    }
    const finished = folderIndex >= cursor.folders.length && !nextLink;
    return {
      ok: true,
      value: {
        messages,
        nextCursor: finished
          ? undefined
          : encode({
              folders: cursor.folders,
              phase: 'history',
              folderIndex,
              checkpoints,
              receivedAfter: cursor.receivedAfter,
              ...(nextLink ? { nextLink } : {}),
            }),
        syncCursor: graphCursor({
          checkpoints,
          folders: cursor.folders,
          folderIndex: 0,
        }),
      },
    };
  }

  public async listChanges(
    input: MailProviderListChangesInput,
  ): Promise<MailProviderResult<MailProviderChangePage>> {
    const cursor = parseGraphCursor(input.cursor);
    if (!cursor)
      return failure(
        'MICROSOFT_SYNC_CURSOR_INVALID',
        'Microsoft sync cursor is invalid.',
        'provider',
        false,
      );
    const folders = cursor.folders ?? Object.keys(cursor.checkpoints);
    if (folders.length === 0) {
      return {
        ok: true,
        value: {
          messages: [],
          deletedProviderMessageIds: [],
          nextCursor: graphCursor(cursor),
          hasMore: false,
        },
      };
    }
    const index = cursor.folderIndex ?? 0;
    if (index >= folders.length) {
      return {
        ok: true,
        value: {
          messages: [],
          deletedProviderMessageIds: [],
          nextCursor: graphCursor({ checkpoints: cursor.checkpoints, folders }),
          hasMore: false,
        },
      };
    }
    const folderId = folders[index];
    const requestUrl =
      cursor.nextLink ??
      cursor.checkpoints[folderId] ??
      this.deltaUrl(folderId, input.limit);
    if (!requestUrl) {
      return failure(
        'MICROSOFT_SYNC_CURSOR_INVALID',
        'Microsoft sync cursor does not contain a folder checkpoint.',
        'provider',
        false,
      );
    }
    const page = await this.request<GraphPage<GraphMessage>>(requestUrl, {
      signal: input.signal,
    });
    if (!page.ok)
      return page.error.code === 'MICROSOFT_HTTP_410'
        ? failure(
            'MICROSOFT_SYNC_CURSOR_INVALID',
            'Microsoft delta cursor expired; a new initial sync is required.',
            'provider',
            false,
          )
        : page;
    const normalized = await this.normalizePage(
      page.value.value ?? [],
      input.signal,
    );
    if (!normalized.ok) return normalized;
    const checkpoints = { ...cursor.checkpoints };
    const nextLink = page.value['@odata.nextLink'];
    let nextIndex = index;
    if (!nextLink) {
      const deltaLink = page.value['@odata.deltaLink'];
      if (!deltaLink)
        return failure(
          'MICROSOFT_DELTA_LINK_MISSING',
          'Microsoft delta response did not include a checkpoint.',
          'provider',
          false,
        );
      checkpoints[folderId] = deltaLink;
      nextIndex += 1;
    }
    const hasMore = Boolean(nextLink) || nextIndex < folders.length;
    return {
      ok: true,
      value: {
        messages: normalized.value.messages,
        deletedProviderMessageIds: normalized.value.deletedProviderMessageIds,
        nextCursor: graphCursor({
          checkpoints,
          folders,
          ...(hasMore
            ? {
                folderIndex: nextIndex,
                ...(nextLink ? { nextLink } : {}),
              }
            : {}),
        }),
        hasMore,
      },
    };
  }

  public async getMessage(
    providerMessageId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<NormalizedMailMessage>> {
    const result = await this.request<GraphMessage>(
      `/me/messages/${encodeURIComponent(providerMessageId)}?$select=${MESSAGE_SELECT}`,
      { signal },
    );
    if (!result.ok) return result;
    return normalizeGraphMessage(result.value, []);
  }

  public async getAttachment(
    providerMessageId: string,
    providerAttachmentId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<MailAttachmentContent>> {
    const result = await this.request<GraphAttachment>(
      `/me/messages/${encodeURIComponent(providerMessageId)}/attachments/${encodeURIComponent(providerAttachmentId)}`,
      { signal },
    );
    if (!result.ok) return result;
    const bytes = Buffer.from(result.value.contentBytes ?? '', 'base64');
    return {
      ok: true,
      value: {
        fileName: result.value.name ?? providerAttachmentId,
        contentType: result.value.contentType ?? 'application/octet-stream',
        size: result.value.size ?? bytes.byteLength,
        stream: new Blob([bytes]).stream(),
      },
    };
  }

  public async sendMessage(
    input: MailProviderSendInput,
  ): Promise<MailProviderSendResult> {
    let token: string;
    try {
      token = await this.accessToken(input.signal);
    } catch (error) {
      return {
        status: 'failed',
        error: errorResult(error, 'MICROSOFT_AUTHORIZATION_FAILED'),
      };
    }
    try {
      if (input.message.draftProviderMessageId) {
        try {
          const updated = await this.updateDraft(
            input.message.draftProviderMessageId,
            input,
          );
          if (!updated.ok) return { status: 'failed', error: updated.error };
        } catch (error) {
          return {
            status: 'failed',
            error: contentPreparationError(
              error,
              'MICROSOFT_MESSAGE_PREPARATION_FAILED',
            ),
          };
        }
        const sent = await fetch(
          `${graphBase(this.config)}/me/messages/${encodeURIComponent(input.message.draftProviderMessageId)}/send`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'client-request-id': input.trackingId,
            },
            signal: input.signal,
          },
        );
        return sent.ok
          ? {
              status: 'accepted',
              providerMessageId: input.message.draftProviderMessageId,
            }
          : submissionResponse(sent);
      }
      if (
        input.message.replyToProviderMessageId ||
        input.message.forwardOfProviderMessageId
      ) {
        return await this.sendRelatedMessage(token, input);
      }
      if (
        input.message.attachments.reduce(
          (total, attachment) => total + attachment.size,
          0,
        ) >= SIMPLE_ATTACHMENT_LIMIT
      ) {
        let draft: MailProviderResult<NormalizedMailMessage>;
        try {
          draft = await this.saveDraft(input);
        } catch (error) {
          return {
            status: 'failed',
            error: contentPreparationError(
              error,
              'MICROSOFT_MESSAGE_PREPARATION_FAILED',
            ),
          };
        }
        if (!draft.ok) return { status: 'failed', error: draft.error };
        const draftId = draft.value.providerMessageId;
        const sent = await fetch(
          `${graphBase(this.config)}/me/messages/${encodeURIComponent(draftId)}/send`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'client-request-id': input.trackingId,
            },
            signal: input.signal,
          },
        );
        return sent.ok
          ? { status: 'accepted', providerMessageId: draftId }
          : submissionResponse(sent);
      }
      let attachments: readonly GraphFileAttachment[];
      try {
        attachments = await graphAttachments(input);
      } catch (error) {
        return {
          status: 'failed',
          error: contentPreparationError(
            error,
            'MICROSOFT_MESSAGE_PREPARATION_FAILED',
          ),
        };
      }
      const response = await fetch(`${graphBase(this.config)}/me/sendMail`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          Prefer: 'IdType="ImmutableId"',
          'client-request-id': input.trackingId,
        },
        body: JSON.stringify({
          message: {
            subject: input.message.subject,
            from: graphRecipient(input.identity),
            body: {
              contentType: input.message.html ? 'HTML' : 'Text',
              content: input.message.html ?? input.message.text,
            },
            toRecipients: input.message.to.map(graphRecipient),
            ccRecipients: input.message.cc.map(graphRecipient),
            bccRecipients: input.message.bcc.map(graphRecipient),
            attachments,
          },
          saveToSentItems: true,
        }),
        signal: input.signal,
      });
      return response.ok
        ? { status: 'accepted' }
        : submissionResponse(response);
    } catch (error) {
      return {
        status: 'submission_unknown',
        error: unknownError(error, 'MICROSOFT_SEND_RESULT_UNKNOWN'),
      };
    }
  }

  public async saveDraft(
    input: MailProviderSendInput,
  ): Promise<MailProviderResult<NormalizedMailMessage>> {
    if (
      input.message.replyToProviderMessageId ||
      input.message.forwardOfProviderMessageId
    ) {
      return this.saveRelatedDraft(input);
    }
    const result = await this.request<GraphMessage>('/me/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'client-request-id': input.trackingId,
      },
      body: JSON.stringify({
        subject: input.message.subject,
        from: graphRecipient(input.identity),
        body: {
          contentType: input.message.html ? 'HTML' : 'Text',
          content: input.message.html ?? input.message.text,
        },
        toRecipients: input.message.to.map(graphRecipient),
        ccRecipients: input.message.cc.map(graphRecipient),
        bccRecipients: input.message.bcc.map(graphRecipient),
      }),
      signal: input.signal,
    });
    if (!result.ok) return result;
    const providerMessageId = required(
      result.value.id,
      'Microsoft draft message ID',
    );
    for (const attachment of input.message.attachments) {
      const added = await this.addAttachment(
        providerMessageId,
        attachment,
        input.trackingId,
        input.signal,
      );
      if (!added.ok) return added;
    }
    const attachments = input.message.attachments.length
      ? await this.attachments(providerMessageId, input.signal)
      : { ok: true as const, value: [] as readonly NormalizedMailAttachment[] };
    if (!attachments.ok) return attachments;
    return normalizeGraphMessage(
      {
        ...result.value,
        isDraft: true,
        parentFolderId: result.value.parentFolderId ?? 'drafts',
      },
      attachments.value,
    );
  }

  public async updateDraft(
    providerMessageId: string,
    input: MailProviderSendInput,
  ): Promise<MailProviderResult<NormalizedMailMessage>> {
    const result = await this.request<GraphMessage>(
      `/me/messages/${encodeURIComponent(providerMessageId)}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'client-request-id': input.trackingId,
        },
        body: JSON.stringify({
          subject: input.message.subject,
          from: graphRecipient(input.identity),
          body: {
            contentType: input.message.html ? 'HTML' : 'Text',
            content: input.message.html ?? input.message.text,
          },
          toRecipients: input.message.to.map(graphRecipient),
          ccRecipients: input.message.cc.map(graphRecipient),
          bccRecipients: input.message.bcc.map(graphRecipient),
        }),
        signal: input.signal,
      },
    );
    if (!result.ok) return result;
    const shouldUpdateAttachments =
      input.message.retainedProviderAttachmentIds !== undefined ||
      input.message.attachments.length > 0;
    const existingAttachments = shouldUpdateAttachments
      ? await this.attachments(providerMessageId, input.signal)
      : { ok: true as const, value: [] as readonly NormalizedMailAttachment[] };
    if (!existingAttachments.ok) return existingAttachments;
    const retained = new Set(
      input.message.retainedProviderAttachmentIds ??
        existingAttachments.value.map(
          (attachment) => attachment.providerAttachmentId,
        ),
    );
    for (const attachment of existingAttachments.value) {
      if (retained.has(attachment.providerAttachmentId)) continue;
      const removed = await this.deleteDraftAttachment(
        providerMessageId,
        attachment.providerAttachmentId,
        input.signal,
      );
      if (!removed.ok) return removed;
    }
    for (const attachment of input.message.attachments) {
      const added = await this.addAttachment(
        providerMessageId,
        attachment,
        input.trackingId,
        input.signal,
      );
      if (!added.ok) return added;
    }
    const attachments = shouldUpdateAttachments
      ? await this.attachments(providerMessageId, input.signal)
      : { ok: true as const, value: [] as readonly NormalizedMailAttachment[] };
    if (!attachments.ok) return attachments;
    return normalizeGraphMessage(
      {
        ...result.value,
        id: result.value.id ?? providerMessageId,
        isDraft: true,
        parentFolderId: result.value.parentFolderId ?? 'drafts',
        from: graphRecipient(input.identity),
        toRecipients: input.message.to.map(graphRecipient),
        ccRecipients: input.message.cc.map(graphRecipient),
        bccRecipients: input.message.bcc.map(graphRecipient),
        subject: input.message.subject,
        body: {
          contentType: input.message.html ? 'HTML' : 'Text',
          content: input.message.html ?? input.message.text,
        },
      },
      attachments.value,
    );
  }

  public setRead(
    providerMessageId: string,
    read: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    return this.updateMessage(providerMessageId, { isRead: read }, signal);
  }

  public setStarred(
    providerMessageId: string,
    starred: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    return this.updateMessage(
      providerMessageId,
      { flag: { flagStatus: starred ? 'flagged' : 'notFlagged' } },
      signal,
    );
  }

  public async moveMessage(
    providerMessageId: string,
    providerFolderId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<{ readonly providerMessageId: string }>> {
    const result = await this.request<GraphMessage>(
      `/me/messages/${encodeURIComponent(providerMessageId)}/move`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destinationId: providerFolderId }),
        signal,
      },
    );
    return result.ok
      ? {
          ok: true,
          value: {
            providerMessageId: required(
              result.value.id,
              'Microsoft moved message ID',
            ),
          },
        }
      : result;
  }

  public async deleteMessage(
    providerMessageId: string,
    permanently: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    if (!permanently) {
      const moved = await this.moveMessage(
        providerMessageId,
        'deleteditems',
        signal,
      );
      return moved.ok ? { ok: true, value: undefined } : moved;
    }
    let token: string;
    try {
      token = await this.accessToken(signal);
    } catch (error) {
      return {
        ok: false,
        error: errorResult(error, 'MICROSOFT_AUTHORIZATION_FAILED'),
      };
    }
    try {
      const response = await fetch(
        `${graphBase(this.config)}/me/messages/${encodeURIComponent(providerMessageId)}`,
        {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${token}`,
            Prefer: 'IdType="ImmutableId"',
          },
          signal,
        },
      );
      return response.ok
        ? { ok: true, value: undefined }
        : { ok: false, error: await responseError(response) };
    } catch (error) {
      return {
        ok: false,
        error: errorResult(error, 'MICROSOFT_MESSAGE_DELETE_FAILED'),
      };
    }
  }

  private async updateMessage(
    providerMessageId: string,
    patch: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    const result = await this.request<GraphMessage>(
      `/me/messages/${encodeURIComponent(providerMessageId)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
        signal,
      },
    );
    return result.ok ? { ok: true, value: undefined } : result;
  }

  private async sendRelatedMessage(
    token: string,
    input: MailProviderSendInput,
  ): Promise<MailProviderSendResult> {
    let prepared: MailProviderResult<NormalizedMailMessage>;
    try {
      prepared = await this.saveRelatedDraft(input);
    } catch (error) {
      return {
        status: 'failed',
        error: contentPreparationError(
          error,
          'MICROSOFT_MESSAGE_PREPARATION_FAILED',
        ),
      };
    }
    if (!prepared.ok) return { status: 'failed', error: prepared.error };
    const draftId = prepared.value.providerMessageId;
    const sent = await fetch(
      `${graphBase(this.config)}/me/messages/${encodeURIComponent(draftId)}/send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'client-request-id': input.trackingId,
        },
        signal: input.signal,
      },
    );
    return sent.ok
      ? { status: 'accepted', providerMessageId: draftId }
      : submissionResponse(sent);
  }

  private async saveRelatedDraft(
    input: MailProviderSendInput,
  ): Promise<MailProviderResult<NormalizedMailMessage>> {
    const sourceId =
      input.message.replyToProviderMessageId ??
      input.message.forwardOfProviderMessageId;
    const action = input.message.replyToProviderMessageId
      ? 'createReply'
      : 'createForward';
    const created = await this.request<GraphMessage>(
      `/me/messages/${encodeURIComponent(required(sourceId, 'Microsoft related message ID'))}/${action}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'client-request-id': input.trackingId,
        },
        body: '{}',
        signal: input.signal,
      },
    );
    if (!created.ok) return created;
    const draft = created.value;
    const draftId = required(draft.id, 'Microsoft reply or forward draft ID');
    const updated = await this.request<GraphMessage>(
      `/me/messages/${encodeURIComponent(draftId)}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'client-request-id': input.trackingId,
        },
        body: JSON.stringify({
          subject: input.message.subject,
          from: graphRecipient(input.identity),
          body: relatedBody(input, draft),
          toRecipients: input.message.to.map(graphRecipient),
          ccRecipients: input.message.cc.map(graphRecipient),
          bccRecipients: input.message.bcc.map(graphRecipient),
        }),
        signal: input.signal,
      },
    );
    if (!updated.ok) return updated;
    for (const attachment of input.message.attachments) {
      const added = await this.addAttachment(
        draftId,
        attachment,
        input.trackingId,
        input.signal,
      );
      if (!added.ok) return added;
    }
    const attachments =
      input.message.forwardOfProviderMessageId ||
      input.message.attachments.length > 0
        ? await this.attachments(draftId, input.signal)
        : {
            ok: true as const,
            value: [] as readonly NormalizedMailAttachment[],
          };
    if (!attachments.ok) return attachments;
    return normalizeGraphMessage(
      {
        ...draft,
        ...updated.value,
        id: draftId,
        isDraft: true,
        parentFolderId: updated.value.parentFolderId ?? 'drafts',
        from: graphRecipient(input.identity),
        toRecipients: input.message.to.map(graphRecipient),
        ccRecipients: input.message.cc.map(graphRecipient),
        bccRecipients: input.message.bcc.map(graphRecipient),
        subject: input.message.subject,
        body: relatedBody(input, draft),
      },
      attachments.value,
    );
  }

  private async deleteDraftAttachment(
    providerMessageId: string,
    providerAttachmentId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    try {
      const response = await fetch(
        `${graphBase(this.config)}/me/messages/${encodeURIComponent(providerMessageId)}/attachments/${encodeURIComponent(providerAttachmentId)}`,
        {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${await this.accessToken(signal)}`,
            Prefer: 'IdType="ImmutableId"',
          },
          signal,
        },
      );
      return response.ok
        ? { ok: true, value: undefined }
        : { ok: false, error: await responseError(response) };
    } catch (error) {
      return {
        ok: false,
        error: errorResult(error, 'MICROSOFT_ATTACHMENT_DELETE_FAILED'),
      };
    }
  }

  private async addAttachment(
    providerMessageId: string,
    attachment: MailProviderSendInput['message']['attachments'][number],
    trackingId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>> {
    try {
      const stream = await attachment.open();
      const bytes = Buffer.from(await new Response(stream).arrayBuffer());
      if (bytes.byteLength !== attachment.size) {
        throw new Error('Mail attachment size changed before submission.');
      }
      if (bytes.byteLength < SIMPLE_ATTACHMENT_LIMIT) {
        const added = await this.request<GraphAttachment>(
          `/me/messages/${encodeURIComponent(providerMessageId)}/attachments`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'client-request-id': trackingId,
            },
            body: JSON.stringify(graphAttachment(attachment, bytes)),
            signal,
          },
        );
        return added.ok ? { ok: true, value: undefined } : added;
      }
      const session = await this.request<GraphUploadSession>(
        `/me/messages/${encodeURIComponent(providerMessageId)}/attachments/createUploadSession`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'client-request-id': trackingId,
          },
          body: JSON.stringify({
            AttachmentItem: {
              attachmentType: 'file',
              name: attachment.fileName,
              size: attachment.size,
              contentType: attachment.contentType,
              isInline: attachment.inline,
              ...(attachment.contentId
                ? { contentId: attachment.contentId }
                : {}),
            },
          }),
          signal,
        },
      );
      if (!session.ok) return session;
      const uploadUrl = required(
        session.value.uploadUrl,
        'Microsoft attachment upload URL',
      );
      if (new URL(uploadUrl).protocol !== 'https:') {
        throw new Error('Microsoft attachment upload URL must use HTTPS.');
      }
      for (
        let start = 0;
        start < bytes.byteLength;
        start += UPLOAD_CHUNK_SIZE
      ) {
        const end = Math.min(start + UPLOAD_CHUNK_SIZE, bytes.byteLength);
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'content-length': String(end - start),
            'content-range': `bytes ${start}-${end - 1}/${bytes.byteLength}`,
          },
          body: bytes.subarray(start, end),
          signal,
        });
        if (!response.ok) {
          return { ok: false, error: await responseError(response) };
        }
      }
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: errorResult(error, 'MICROSOFT_ATTACHMENT_UPLOAD_FAILED'),
      };
    }
  }

  private async normalizePage(
    messages: readonly GraphMessage[],
    signal?: AbortSignal,
  ): Promise<
    MailProviderResult<{
      readonly messages: readonly NormalizedMailMessage[];
      readonly deletedProviderMessageIds: readonly string[];
    }>
  > {
    const normalized: NormalizedMailMessage[] = [];
    const deleted: string[] = [];
    for (const message of messages) {
      if (message['@removed']) {
        if (!message.id) continue;
        const current = await this.getMessage(message.id, signal);
        if (current.ok) {
          normalized.push(current.value);
        } else if (current.error.code === 'MICROSOFT_HTTP_404') {
          deleted.push(message.id);
        } else {
          return current;
        }
        continue;
      }
      const attachments =
        message.hasAttachments && message.id
          ? await this.attachments(message.id, signal)
          : {
              ok: true as const,
              value: [] as readonly NormalizedMailAttachment[],
            };
      if (!attachments.ok) return attachments;
      const result = normalizeGraphMessage(message, attachments.value);
      if (!result.ok) return result;
      normalized.push(result.value);
    }
    return {
      ok: true,
      value: {
        messages: normalized,
        deletedProviderMessageIds: deleted,
      },
    };
  }

  private async attachments(
    messageId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<readonly NormalizedMailAttachment[]>> {
    const result = await this.request<GraphPage<GraphAttachment>>(
      `/me/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline,contentId`,
      { signal },
    );
    if (!result.ok) return result;
    return {
      ok: true,
      value: (result.value.value ?? []).flatMap((item) =>
        item.id
          ? [
              {
                providerAttachmentId: item.id,
                fileName: item.name ?? '',
                contentType: item.contentType ?? 'application/octet-stream',
                size: item.size ?? 0,
                contentId: item.contentId,
                inline: item.isInline ?? false,
              },
            ]
          : [],
      ),
    };
  }

  private deltaUrl(
    folderId: string,
    limit: number,
    _receivedAfter?: string,
  ): string {
    const query = new URLSearchParams({
      $select: MESSAGE_SELECT,
      $top: String(Math.min(limit, 500)),
      $orderby: 'receivedDateTime desc',
    });
    return `/me/mailFolders/${encodeURIComponent(folderId)}/messages/delta?${query.toString()}`;
  }

  private latestDeltaUrl(folderId: string): string {
    const query = new URLSearchParams({ $deltatoken: 'latest' });
    return `/me/mailFolders/${encodeURIComponent(folderId)}/messages/delta?${query.toString()}`;
  }

  private messageListUrl(
    folderId: string,
    limit: number,
    receivedAfter?: string,
  ): string {
    const query = new URLSearchParams({
      $select: MESSAGE_SELECT,
      $top: String(Math.min(limit, 500)),
      $orderby: 'receivedDateTime desc',
    });
    if (receivedAfter) {
      query.set('$filter', `receivedDateTime ge ${receivedAfter}`);
    }
    return `/me/mailFolders/${encodeURIComponent(folderId)}/messages?${query.toString()}`;
  }

  private async request<T>(
    pathOrUrl: string,
    init: RequestInit,
  ): Promise<MailProviderResult<T>> {
    try {
      return await graphRequest<T>(
        this.config,
        await this.accessToken(init.signal ?? undefined),
        pathOrUrl,
        init,
      );
    } catch (error) {
      return {
        ok: false,
        error: errorResult(error, 'MICROSOFT_REQUEST_FAILED'),
      };
    }
  }

  private async accessToken(signal?: AbortSignal): Promise<string> {
    const credential =
      await this.context.credentials.getOrRefresh<MicrosoftCredential>(
        this.account.credentialReference,
        (value) => Date.parse(value.expiresAt) > Date.now() + 60_000,
        async (value) => {
          const refreshed = await exchangeToken(
            this.config,
            {
              client_id: this.config.clientId,
              client_secret: this.config.clientSecret,
              refresh_token: value.refreshToken,
              grant_type: 'refresh_token',
              scope: value.scopes.join(' '),
            },
            signal,
          );
          if (!refreshed.ok) throw new ProviderRequestError(refreshed.error);
          return {
            ...value,
            accessToken: required(
              refreshed.value.access_token,
              'Microsoft access token',
            ),
            refreshToken: refreshed.value.refresh_token ?? value.refreshToken,
            expiresAt: expiry(refreshed.value.expires_in),
            scopes: splitScopes(refreshed.value.scope, value.scopes),
            tokenType: refreshed.value.token_type ?? value.tokenType,
          };
        },
      );
    return credential.accessToken;
  }
}

interface GraphFileAttachment {
  readonly '@odata.type': '#microsoft.graph.fileAttachment';
  readonly name: string;
  readonly contentType: string;
  readonly contentBytes: string;
  readonly isInline: boolean;
  readonly contentId?: string;
}

function graphAttachment(
  attachment: MailProviderSendInput['message']['attachments'][number],
  bytes: Buffer,
): GraphFileAttachment {
  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: attachment.fileName,
    contentType: attachment.contentType,
    contentBytes: bytes.toString('base64'),
    isInline: attachment.inline,
    ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
  };
}

async function graphAttachments(
  input: MailProviderSendInput,
): Promise<readonly GraphFileAttachment[]> {
  return Promise.all(
    input.message.attachments.map(async (attachment) => {
      const stream = await attachment.open();
      const bytes = Buffer.from(await new Response(stream).arrayBuffer());
      if (bytes.byteLength !== attachment.size) {
        throw new Error('Mail attachment size changed before submission.');
      }
      return graphAttachment(attachment, bytes);
    }),
  );
}

function relatedBody(
  input: MailProviderSendInput,
  draft: GraphMessage,
): { readonly contentType: 'HTML' | 'Text'; readonly content: string } {
  const contentType = input.message.html ? 'HTML' : 'Text';
  const comment = input.message.html ?? input.message.text;
  const original = draft.body?.content ?? '';
  if (!original) return { contentType, content: comment };
  if (contentType === 'HTML') {
    return { contentType, content: `${comment}<br><br>${original}` };
  }
  return { contentType, content: `${comment}\n\n${htmlToText(original)}` };
}

function htmlToText(value: string): string {
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

async function exchangeToken(
  config: MicrosoftMailProviderConfig,
  body: Record<string, string>,
  signal?: AbortSignal,
): Promise<MailProviderResult<MicrosoftTokenResponse>> {
  try {
    const response = await fetch(`${authority(config)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
      signal,
    });
    const value = (await response.json()) as MicrosoftTokenResponse;
    return response.ok
      ? { ok: true, value }
      : failure(
          `MICROSOFT_OAUTH_${value.error ?? response.status}`,
          value.error_description ?? 'Microsoft OAuth token exchange failed.',
          'authentication',
          false,
        );
  } catch (error) {
    return {
      ok: false,
      error: unknownError(error, 'MICROSOFT_OAUTH_REQUEST_FAILED'),
    };
  }
}

async function graphRequest<T>(
  config: MicrosoftMailProviderConfig,
  token: string,
  pathOrUrl: string,
  init: RequestInit,
): Promise<MailProviderResult<T>> {
  try {
    const resolvedUrl = resolveGraphUrl(config, pathOrUrl);
    if (!resolvedUrl.ok) return resolvedUrl;
    const response = await fetch(resolvedUrl.value, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        Prefer: 'IdType="ImmutableId", outlook.body-content-type="html"',
      },
    });
    return response.ok
      ? { ok: true, value: (await response.json()) as T }
      : { ok: false, error: await responseError(response) };
  } catch (error) {
    return {
      ok: false,
      error: unknownError(error, 'MICROSOFT_REQUEST_FAILED'),
    };
  }
}

function resolveGraphUrl(
  config: MicrosoftMailProviderConfig,
  pathOrUrl: string,
): MailProviderResult<string> {
  const baseUrl = new URL(graphBase(config));
  const url = /^https?:\/\//i.test(pathOrUrl)
    ? new URL(pathOrUrl)
    : new URL(
        `${baseUrl.href}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`,
      );
  const basePath = `${baseUrl.pathname.replace(/\/$/, '')}/`;
  if (url.origin !== baseUrl.origin || !url.pathname.startsWith(basePath)) {
    return failure(
      'MICROSOFT_PAGING_URL_INVALID',
      'Microsoft Graph returned a paging URL outside the configured API endpoint.',
      'provider',
      false,
    );
  }
  return { ok: true, value: url.href };
}

function normalizeGraphMessage(
  message: GraphMessage,
  attachments: readonly NormalizedMailAttachment[],
): MailProviderResult<NormalizedMailMessage> {
  if (!message.id)
    return failure(
      'MICROSOFT_MESSAGE_INVALID',
      'Microsoft message did not include an ID.',
      'provider',
      false,
    );
  const html =
    message.body?.contentType?.toLowerCase() === 'html'
      ? message.body.content
      : undefined;
  const text = html ? undefined : message.body?.content;
  return {
    ok: true,
    value: {
      providerMessageId: message.id,
      internetMessageId: message.internetMessageId,
      providerConversationId: message.conversationId,
      providerFolderIds: message.parentFolderId ? [message.parentFolderId] : [],
      from: graphAddress(message.from),
      to: graphAddresses(message.toRecipients),
      cc: graphAddresses(message.ccRecipients),
      bcc: graphAddresses(message.bccRecipients),
      replyTo: graphAddresses(message.replyTo),
      references: [],
      subject: message.subject ?? '',
      preview: message.bodyPreview,
      text,
      html,
      receivedAt: message.receivedDateTime,
      sentAt: message.sentDateTime,
      read: message.isRead ?? false,
      starred: message.flag?.flagStatus === 'flagged',
      draft: message.isDraft ?? false,
      attachments,
    },
  };
}

function graphRecipient(address: MailAddress): GraphEmailAddress {
  return { emailAddress: { address: address.address, name: address.name } };
}

function microsoftIdentities(
  profile: GraphProfile,
  primaryAddress: string,
): readonly {
  address: string;
  displayName?: string;
  isPrimary: boolean;
  canSend: boolean;
}[] {
  const addresses = new Map<string, string>();
  addresses.set(primaryAddress.toLowerCase(), primaryAddress);
  for (const value of profile.proxyAddresses ?? []) {
    const match = value.match(/^smtp:(.+)$/iu);
    if (match?.[1]) addresses.set(match[1].toLowerCase(), match[1]);
  }
  return [...addresses.values()].map((address) => ({
    address,
    displayName: profile.displayName,
    isPrimary: address.toLowerCase() === primaryAddress.toLowerCase(),
    canSend: true,
  }));
}

function graphAddress(
  value: GraphEmailAddress | undefined,
): MailAddress | undefined {
  const address = value?.emailAddress?.address;
  return address ? { address, name: value?.emailAddress?.name } : undefined;
}

function graphAddresses(
  values: readonly GraphEmailAddress[] | undefined,
): readonly MailAddress[] {
  return (values ?? []).flatMap((value) => {
    const address = graphAddress(value);
    return address ? [address] : [];
  });
}

function graphFolderType(name: string | undefined): MailFolderType {
  const value = name?.toLowerCase();
  if (value === 'inbox') return 'inbox';
  if (value === 'sent items') return 'sent';
  if (value === 'drafts') return 'drafts';
  if (value === 'deleted items') return 'trash';
  if (value === 'junk email') return 'junk';
  if (value === 'archive') return 'archive';
  return 'custom';
}

function graphCursor(value: ChangeCursor): MailSyncCursor {
  return {
    value: {
      checkpoints: JSON.stringify(value.checkpoints),
      folders: JSON.stringify(value.folders ?? []),
      folderIndex: String(value.folderIndex ?? 0),
      ...(value.nextLink ? { nextLink: value.nextLink } : {}),
    },
    version: 'microsoft-graph-v1',
  };
}

function parseGraphCursor(
  cursor: MailSyncCursor | undefined,
): ChangeCursor | undefined {
  const value = cursor?.value;
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.checkpoints !== 'string'
  )
    return undefined;
  try {
    const checkpoints: unknown = JSON.parse(value.checkpoints);
    const folders: unknown =
      typeof value.folders === 'string' ? JSON.parse(value.folders) : undefined;
    const folderIndex = Number(value.folderIndex ?? 0);
    if (
      !isStringRecord(checkpoints) ||
      (folders !== undefined && !isStringArray(folders)) ||
      !Number.isSafeInteger(folderIndex) ||
      folderIndex < 0
    ) {
      return undefined;
    }
    return {
      checkpoints,
      folders,
      folderIndex,
      nextLink: typeof value.nextLink === 'string' ? value.nextLink : undefined,
    };
  } catch {
    return undefined;
  }
}

function filterReceivedAfter(
  messages: readonly NormalizedMailMessage[],
  receivedAfter: string | undefined,
): readonly NormalizedMailMessage[] {
  if (!receivedAfter) return messages;
  const cutoff = Date.parse(receivedAfter);
  if (!Number.isFinite(cutoff)) return messages;
  return messages.filter(
    (message) =>
      message.receivedAt !== undefined &&
      Date.parse(message.receivedAt) >= cutoff,
  );
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeFolderCursor(value: string): FolderCursor | undefined {
  const decoded = decode(value);
  if (!decoded || typeof decoded !== 'object') return undefined;
  const record = decoded as Record<string, unknown>;
  return isStringArray(record.pending) &&
    isStringArray(record.providerFolderIds)
    ? {
        pending: record.pending,
        providerFolderIds: record.providerFolderIds,
      }
    : undefined;
}

function decodeInitialCursor(value: string): InitialCursor | undefined {
  const decoded = decode(value);
  if (!decoded || typeof decoded !== 'object') return undefined;
  const record = decoded as Record<string, unknown>;
  const { phase, folders, folderIndex, checkpoints } = record;
  if (
    (phase !== 'baseline' && phase !== 'history') ||
    !isStringArray(folders) ||
    typeof folderIndex !== 'number' ||
    !Number.isSafeInteger(folderIndex) ||
    folderIndex < 0 ||
    !isStringRecord(checkpoints)
  ) {
    return undefined;
  }
  const { nextLink, receivedAfter } = record;
  if (
    (nextLink !== undefined && typeof nextLink !== 'string') ||
    (receivedAfter !== undefined && typeof receivedAfter !== 'string')
  ) {
    return undefined;
  }
  return { phase, folders, folderIndex, checkpoints, nextLink, receivedAfter };
}

function decode(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isStringRecord(
  value: unknown,
): value is Readonly<Record<string, string>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  );
}

function invalidSyncCursor<T>(): MailProviderResult<T> {
  return failure(
    'MICROSOFT_SYNC_CURSOR_INVALID',
    'Microsoft sync cursor is invalid.',
    'provider',
    false,
  );
}

function authority(config: MicrosoftMailProviderConfig): string {
  return `${(config.authorityBaseUrl ?? 'https://login.microsoftonline.com').replace(/\/$/, '')}/${encodeURIComponent(config.tenant ?? 'common')}`;
}

function graphBase(config: MicrosoftMailProviderConfig): string {
  return (config.graphBaseUrl ?? 'https://graph.microsoft.com/v1.0').replace(
    /\/$/,
    '',
  );
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

async function responseError(response: Response): Promise<MailProviderError> {
  let message = `Microsoft Graph request failed with status ${response.status}.`;
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    message = body.error?.message ?? message;
  } catch {
    // Some Provider errors do not use a JSON response body.
  }
  const retryAfter = Number(response.headers.get('retry-after'));
  return {
    code: `MICROSOFT_HTTP_${response.status}`,
    message,
    category:
      response.status === 401 || response.status === 403
        ? 'authentication'
        : response.status === 429
          ? 'rate_limit'
          : 'provider',
    retryable: response.status === 429 || response.status >= 500,
    retryAfterMs:
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : undefined,
  };
}

async function submissionResponse(
  response: Response,
): Promise<MailProviderSendResult> {
  const error = await responseError(response);
  return {
    status: response.status >= 500 ? 'submission_unknown' : 'failed',
    error: response.status >= 500 ? { ...error, retryable: false } : error,
  };
}

function unknownError(error: unknown, code: string): MailProviderError {
  return {
    code,
    message:
      error instanceof Error ? error.message : 'Microsoft request failed.',
    category: 'network',
    retryable: true,
  };
}

function contentPreparationError(
  error: unknown,
  code: string,
): MailProviderError {
  return {
    code,
    message:
      error instanceof Error
        ? error.message
        : 'Mail content preparation failed.',
    category: 'content',
    retryable: false,
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
    'MICROSOFT_PUSH_NOTIFICATION_INVALID',
    'Microsoft Graph push notification payload is invalid.',
    'provider',
    false,
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

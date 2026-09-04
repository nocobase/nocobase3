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
  MailProviderListChangesInput,
  MailProviderListMessagesInput,
  MailProviderMessagePage,
  MailProviderResult,
  MailProviderSendInput,
  MailProviderSendResult,
  MailSyncCursor,
  NormalizedMailAttachment,
  NormalizedMailFolder,
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

interface InitialCursor {
  readonly folders: readonly string[];
  readonly folderIndex: number;
  readonly checkpoints: Readonly<Record<string, string>>;
  readonly nextLink?: string;
}

interface ChangeCursor {
  readonly checkpoints: Readonly<Record<string, string>>;
  readonly folders?: readonly string[];
  readonly folderIndex?: number;
  readonly nextLink?: string;
  readonly bootstrap?: boolean;
  readonly receivedAfter?: string;
  readonly pageSize?: number;
}

export const microsoftMailProviderDefinition: MailProviderDefinition<MicrosoftMailProviderConfig> =
  {
    type: 'microsoft',
    label: 'Microsoft 365',
    capabilities: {
      receive: true,
      send: true,
      incrementalSync: true,
      pushNotifications: false,
      folders: true,
      labels: false,
      drafts: false,
      moveMessage: false,
      aliases: false,
    },
    validateConfig(config: MicrosoftMailProviderConfig): void {
      if (!config.clientId || !config.clientSecret) {
        throw new Error(
          'Microsoft OAuth clientId and clientSecret are required.',
        );
      }
    },
    authorization: createAuthorization(),
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
        '/me?$select=id,displayName,mail,userPrincipalName',
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
          authorizationSubject: profile.value.id,
          credentialReference,
          scopes,
          credentialExpiresAt: expiresAt,
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

  public getCurrentSyncCursor(): Promise<MailProviderResult<MailSyncCursor>> {
    return Promise.resolve({
      ok: true,
      value: graphCursor({ checkpoints: {}, folders: [] }),
    });
  }

  public async listFolders(
    signal?: AbortSignal,
  ): Promise<MailProviderResult<readonly NormalizedMailFolder[]>> {
    const folders = await this.allFolders(signal);
    return folders.ok
      ? {
          ok: true,
          value: folders.value.map((folder) => ({
            providerFolderId: required(folder.id, 'Microsoft folder ID'),
            type: graphFolderType(folder.displayName),
            name: folder.displayName ?? '',
            unreadCount: folder.unreadItemCount,
            kind: 'folder',
          })),
        }
      : folders;
  }

  public async listMessages(
    input: MailProviderListMessagesInput,
  ): Promise<MailProviderResult<MailProviderMessagePage>> {
    let cursor: InitialCursor | undefined;
    if (input.cursor) {
      cursor = decode<InitialCursor>(input.cursor);
    } else {
      const folders = input.providerFolderIds?.length
        ? { ok: true as const, value: input.providerFolderIds }
        : await this.folderIds(input.signal);
      if (!folders.ok) return folders;
      cursor = { folders: folders.value, folderIndex: 0, checkpoints: {} };
    }
    if (cursor.folderIndex >= cursor.folders.length) {
      return {
        ok: true,
        value: {
          messages: [],
          syncCursor: graphCursor({ checkpoints: cursor.checkpoints }),
        },
      };
    }
    const folderId = cursor.folders[cursor.folderIndex];
    const url =
      cursor.nextLink ??
      this.deltaUrl(folderId, input.limit ?? 100, input.receivedAfter);
    const page = await this.request<GraphPage<GraphMessage>>(url, {
      signal: input.signal,
    });
    if (!page.ok) return page;
    const normalized = await this.normalizePage(
      page.value.value ?? [],
      input.signal,
    );
    if (!normalized.ok) return normalized;
    const checkpoints = { ...cursor.checkpoints };
    let folderIndex = cursor.folderIndex;
    const nextLink = page.value['@odata.nextLink'];
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
      folderIndex += 1;
    }
    const finished = folderIndex >= cursor.folders.length && !nextLink;
    return {
      ok: true,
      value: {
        messages: normalized.value.messages,
        nextCursor: finished
          ? undefined
          : encode({
              folders: cursor.folders,
              folderIndex,
              checkpoints,
              ...(nextLink ? { nextLink } : {}),
            }),
        syncCursor: graphCursor({
          checkpoints,
          folders: cursor.folders,
          folderIndex,
          ...(nextLink ? { nextLink } : {}),
          ...(!finished
            ? {
                bootstrap: true,
                receivedAfter: input.receivedAfter,
                pageSize: input.limit ?? 100,
              }
            : {}),
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
      (cursor.bootstrap
        ? this.deltaUrl(
            folderId,
            cursor.pageSize ?? input.limit,
            cursor.receivedAfter,
          )
        : undefined);
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
    const normalized = cursor.bootstrap
      ? {
          ok: true as const,
          value: {
            messages: [] as readonly NormalizedMailMessage[],
            deletedProviderMessageIds: [] as readonly string[],
          },
        }
      : await this.normalizePage(page.value.value ?? [], input.signal);
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
                ...(cursor.bootstrap
                  ? {
                      bootstrap: true,
                      receivedAfter: cursor.receivedAfter,
                      pageSize: cursor.pageSize,
                    }
                  : {}),
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
    try {
      const token = await this.accessToken(input.signal);
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
            body: {
              contentType: input.message.html ? 'HTML' : 'Text',
              content: input.message.html ?? input.message.text,
            },
            toRecipients: input.message.to.map(graphRecipient),
            ccRecipients: input.message.cc.map(graphRecipient),
            bccRecipients: input.message.bcc.map(graphRecipient),
          },
          saveToSentItems: true,
        }),
        signal: input.signal,
      });
      return response.ok
        ? { status: 'accepted' }
        : { status: 'failed', error: await responseError(response) };
    } catch (error) {
      return {
        status: 'submission_unknown',
        error: unknownError(error, 'MICROSOFT_SEND_RESULT_UNKNOWN'),
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

  private async folderIds(
    signal?: AbortSignal,
  ): Promise<MailProviderResult<readonly string[]>> {
    const folders = await this.allFolders(signal);
    return folders.ok
      ? {
          ok: true,
          value: folders.value.flatMap((folder) =>
            folder.id ? [folder.id] : [],
          ),
        }
      : folders;
  }

  private async allFolders(
    signal?: AbortSignal,
  ): Promise<MailProviderResult<readonly GraphFolder[]>> {
    const output: GraphFolder[] = [];
    const pending = ['/me/mailFolders?includeHiddenFolders=true&$top=100'];
    while (pending.length) {
      let url: string | undefined = pending.shift();
      while (url) {
        const page = await this.request<GraphPage<GraphFolder>>(url, {
          signal,
        });
        if (!page.ok) return page;
        for (const folder of page.value.value ?? []) {
          output.push(folder);
          if ((folder.childFolderCount ?? 0) > 0 && folder.id) {
            pending.push(
              `/me/mailFolders/${encodeURIComponent(folder.id)}/childFolders?includeHiddenFolders=true&$top=100`,
            );
          }
        }
        url = page.value['@odata.nextLink'];
      }
    }
    return { ok: true, value: output };
  }

  private deltaUrl(
    folderId: string,
    limit: number,
    receivedAfter?: string,
  ): string {
    const query = new URLSearchParams({
      $select: MESSAGE_SELECT,
      $top: String(Math.min(limit, 500)),
    });
    if (receivedAfter)
      query.set('$filter', `receivedDateTime ge ${receivedAfter}`);
    return `/me/mailFolders/${encodeURIComponent(folderId)}/messages/delta?${query.toString()}`;
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
        error: unknownError(error, 'MICROSOFT_REQUEST_FAILED'),
      };
    }
  }

  private async accessToken(signal?: AbortSignal): Promise<string> {
    const credential = await this.context.credentials.get<MicrosoftCredential>(
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
        scope: credential.scopes.join(' '),
      },
      signal,
    );
    if (!refreshed.ok) throw new Error(refreshed.error.message);
    const next: MicrosoftCredential = {
      ...credential,
      accessToken: required(
        refreshed.value.access_token,
        'Microsoft access token',
      ),
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
      ...(value.bootstrap ? { bootstrap: 'true' } : {}),
      ...(value.receivedAfter ? { receivedAfter: value.receivedAfter } : {}),
      ...(value.pageSize ? { pageSize: String(value.pageSize) } : {}),
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
  const checkpoints = JSON.parse(value.checkpoints) as Record<string, string>;
  const folders =
    typeof value.folders === 'string'
      ? (JSON.parse(value.folders) as readonly string[])
      : undefined;
  return {
    checkpoints,
    folders,
    folderIndex: Number(value.folderIndex ?? 0),
    nextLink: typeof value.nextLink === 'string' ? value.nextLink : undefined,
    bootstrap: value.bootstrap === 'true',
    receivedAfter:
      typeof value.receivedAfter === 'string' ? value.receivedAfter : undefined,
    pageSize:
      typeof value.pageSize === 'string' ? Number(value.pageSize) : undefined,
  };
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
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

function unknownError(error: unknown, code: string): MailProviderError {
  return {
    code,
    message:
      error instanceof Error ? error.message : 'Microsoft request failed.',
    category: 'network',
    retryable: true,
  };
}

function failure<T>(
  code: string,
  message: string,
  category: MailProviderError['category'],
  retryable: boolean,
): MailProviderResult<T> {
  return { ok: false, error: { code, message, category, retryable } };
}

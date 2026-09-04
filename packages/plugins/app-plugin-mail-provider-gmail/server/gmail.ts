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
  'https://www.googleapis.com/auth/gmail.modify',
] as const;

export interface GmailMailProviderConfig extends MailProviderConfig {
  readonly type: 'gmail';
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scopes?: readonly string[];
  readonly authorizationEndpoint?: string;
  readonly tokenEndpoint?: string;
  readonly apiBaseUrl?: string;
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
}

export const gmailMailProviderDefinition: MailProviderDefinition<GmailMailProviderConfig> =
  {
    type: 'gmail',
    label: 'Gmail',
    capabilities: {
      receive: true,
      send: true,
      incrementalSync: true,
      pushNotifications: false,
      folders: true,
      labels: true,
      drafts: false,
      moveMessage: false,
      aliases: false,
    },
    validateConfig(config: GmailMailProviderConfig): void {
      if (!config.clientId || !config.clientSecret) {
        throw new Error('Gmail OAuth clientId and clientSecret are required.');
      }
    },
    authorization: createAuthorization(),
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
        return {
          ok: true,
          value: {
            address: profile.value.emailAddress,
            credentialReference,
            scopes,
            credentialExpiresAt: expiresAt,
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

  public constructor(
    private readonly context: MailProviderContext,
    private readonly config: GmailMailProviderConfig,
    private readonly account: MailAccount,
  ) {
    this.identity = account.provider;
  }

  public async getCurrentSyncCursor(
    signal?: AbortSignal,
  ): Promise<MailProviderResult<MailSyncCursor>> {
    const profile = await this.request<GmailProfile>('/users/me/profile', {
      signal,
    });
    return profile.ok && profile.value.historyId
      ? { ok: true, value: gmailCursor(profile.value.historyId) }
      : profile.ok
        ? failure(
            'GMAIL_HISTORY_ID_MISSING',
            'Gmail profile did not include a history ID.',
            'provider',
            false,
          )
        : profile;
  }

  public async listFolders(
    signal?: AbortSignal,
  ): Promise<MailProviderResult<readonly NormalizedMailFolder[]>> {
    const result = await this.request<GmailLabelList>('/users/me/labels', {
      signal,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      value: (result.value.labels ?? []).flatMap((label) =>
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
      ),
    };
  }

  public async listMessages(
    input: MailProviderListMessagesInput,
  ): Promise<MailProviderResult<MailProviderMessagePage>> {
    const query = new URLSearchParams();
    query.set('maxResults', String(Math.min(input.limit ?? 100, 500)));
    if (input.cursor) query.set('pageToken', input.cursor);
    for (const labelId of input.providerFolderIds ?? [])
      query.append('labelIds', labelId);
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
        ? failure(
            'GMAIL_SYNC_CURSOR_INVALID',
            'Gmail history cursor expired; a new initial sync is required.',
            'provider',
            false,
          )
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
    return {
      ok: true,
      value: {
        messages: results.flatMap((result) =>
          result.ok ? [result.value] : [],
        ),
        deletedProviderMessageIds: [...deleted],
        nextCursor: gmailCursor(historyId, history.value.nextPageToken),
        hasMore: Boolean(history.value.nextPageToken),
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
        error: unknownError(error, 'GMAIL_AUTHORIZATION_FAILED'),
      };
    }
    try {
      const response = await fetch(
        `${apiBase(this.config)}/users/me/messages/send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ raw: buildMime(input) }),
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
      return { ok: false, error: unknownError(error, 'GMAIL_REQUEST_FAILED') };
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
    if (!refreshed.ok) throw new Error(refreshed.error.message);
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
      providerFolderIds: message.labelIds ?? [],
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

function buildMime(input: MailProviderSendInput): string {
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
    'MIME-Version: 1.0',
  ];
  let body: string;
  if (input.message.html) {
    const boundary = `nocobase-${input.trackingId.replace(/[^a-zA-Z0-9]/g, '')}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      input.message.text,
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      input.message.html,
      `--${boundary}--`,
      '',
    ].join('\r\n');
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

function gmailCursor(historyId: string, pageToken?: string): MailSyncCursor {
  return {
    value: { historyId, ...(pageToken ? { pageToken } : {}) },
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
      }
    : undefined;
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

function failure<T>(
  code: string,
  message: string,
  category: MailProviderError['category'],
  retryable: boolean,
): MailProviderResult<T> {
  return { ok: false, error: { code, message, category, retryable } };
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

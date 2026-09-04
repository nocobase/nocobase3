export const MAIL_PROVIDER_CAPABILITIES: readonly [
  'receive',
  'send',
  'incrementalSync',
  'pushNotifications',
  'folders',
  'labels',
  'drafts',
  'moveMessage',
  'aliases',
] = [
  'receive',
  'send',
  'incrementalSync',
  'pushNotifications',
  'folders',
  'labels',
  'drafts',
  'moveMessage',
  'aliases',
];

export type MailProviderCapability =
  (typeof MAIL_PROVIDER_CAPABILITIES)[number];

export interface MailProviderCapabilities {
  readonly receive: boolean;
  readonly send: boolean;
  readonly incrementalSync: boolean;
  readonly pushNotifications: boolean;
  readonly folders: boolean;
  readonly labels: boolean;
  readonly drafts: boolean;
  readonly moveMessage: boolean;
  readonly aliases: boolean;
}

export interface MailProviderIdentity {
  /** Provider implementation type, for example `gmail` or `microsoft`. */
  readonly type: string;
  /** Host-defined configuration name, for example `company-google`. */
  readonly name: string;
}

export interface MailProviderConfig extends MailProviderIdentity {
  readonly enabled?: boolean;
}

export type MailAccountStatus =
  | 'connecting'
  | 'active'
  | 'reauthorizationRequired'
  | 'suspended'
  | 'revoked'
  | 'removing';

export interface MailSyncCursor {
  /** Opaque, Provider-owned cursor. Mail core must persist but not parse it. */
  readonly value: string | Readonly<Record<string, string>>;
  readonly version?: string;
}

export interface MailAccount {
  readonly id: string;
  readonly userId: string;
  readonly provider: MailProviderIdentity;
  readonly address: string;
  readonly displayName?: string;
  readonly credentialReference: string;
  readonly authorizationSubject?: string;
  readonly scopes: readonly string[];
  readonly credentialExpiresAt?: string;
  readonly status: MailAccountStatus;
  readonly syncCursor?: MailSyncCursor;
  readonly isDefault: boolean;
}

/** API-safe account metadata. Credential references remain inside mail core. */
export type MailAccountView = Omit<
  MailAccount,
  'credentialReference' | 'authorizationSubject' | 'syncCursor'
>;

export interface MailIdentity {
  readonly id: string;
  readonly accountId: string;
  readonly address: string;
  readonly displayName?: string;
  readonly isPrimary: boolean;
  readonly canSend: boolean;
}

export type MailFolderType =
  'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | 'custom';

export interface MailFolder {
  readonly id: string;
  readonly accountId: string;
  readonly providerFolderId: string;
  readonly type: MailFolderType;
  readonly name: string;
  readonly unreadCount?: number;
  /** Gmail labels and Outlook folders share this model without sharing semantics. */
  readonly kind: 'folder' | 'label';
}

export interface MailAddress {
  readonly address: string;
  readonly name?: string;
}

export interface MailAttachment {
  readonly id: string;
  readonly messageId: string;
  readonly providerAttachmentId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly contentId?: string;
  readonly inline: boolean;
  readonly fileReference?: string;
}

export interface MailMessageSummary {
  readonly id: string;
  readonly accountId: string;
  readonly providerMessageId: string;
  readonly internetMessageId?: string;
  readonly conversationId?: string;
  readonly folderIds: readonly string[];
  readonly from?: MailAddress;
  readonly to: readonly MailAddress[];
  readonly cc: readonly MailAddress[];
  readonly bcc: readonly MailAddress[];
  readonly subject: string;
  readonly preview?: string;
  readonly receivedAt?: string;
  readonly sentAt?: string;
  readonly read: boolean;
  readonly starred: boolean;
  readonly draft: boolean;
  readonly hasAttachments: boolean;
}

export interface MailMessage extends MailMessageSummary {
  readonly replyTo: readonly MailAddress[];
  readonly inReplyTo?: string;
  readonly references: readonly string[];
  readonly text?: string;
  readonly html?: string;
  readonly attachments: readonly MailAttachment[];
}

export interface MailConversation {
  readonly id: string;
  readonly accountId: string;
  readonly providerConversationId?: string;
  readonly participants: readonly MailAddress[];
  readonly latestMessageAt: string;
  readonly unread: boolean;
  readonly messageIds: readonly string[];
}

export interface MailTemplate {
  readonly id: string;
  readonly name: string;
  readonly subject: string;
  readonly text?: string;
  readonly html: string;
  readonly scope: 'private' | 'shared';
  readonly ownerId?: string;
}

export type MailJobType = 'sync' | 'scheduledSend' | 'bulkSend';
export type MailJobStatus =
  'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';

export interface MailJob {
  readonly id: string;
  readonly type: MailJobType;
  readonly accountId: string;
  readonly status: MailJobStatus;
  readonly completed: number;
  readonly total: number;
  readonly errorCode?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type MailSyncMode = 'initial' | 'incremental';
export type MailSyncPhase =
  'preparing' | 'history' | 'catchUp' | 'incremental' | 'completed';
export type MailSyncRunStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface MailInitialSyncPolicy {
  readonly receivedAfter?: string;
  readonly maxMessages: number;
  readonly batchSize: number;
}

export interface MailSyncRun {
  readonly id: string;
  readonly accountId: string;
  readonly requestedBy: string;
  readonly mode: MailSyncMode;
  readonly phase: MailSyncPhase;
  readonly status: MailSyncRunStatus;
  readonly revision: number;
  readonly policy: MailInitialSyncPolicy;
  readonly processedMessages: number;
  readonly processedPages: number;
  readonly historyCursor?: string;
  readonly baselineCursor?: MailSyncCursor;
  readonly changeCursor?: MailSyncCursor;
  readonly leaseToken?: string;
  readonly leaseExpiresAt?: string;
  readonly error?: MailProviderError;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

/** API-safe progress view. Provider cursors and leases never leave mail core. */
export interface MailSyncRunView {
  readonly id: string;
  readonly accountId: string;
  readonly mode: MailSyncMode;
  readonly phase: MailSyncPhase;
  readonly status: MailSyncRunStatus;
  readonly policy: MailInitialSyncPolicy;
  readonly processedMessages: number;
  readonly processedPages: number;
  readonly error?: MailPublicError;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export interface MailStartSyncInput {
  readonly accountId: string;
  readonly mode?: MailSyncMode;
  readonly receivedAfter?: string;
  readonly maxMessages?: number;
  readonly batchSize?: number;
}

export type MailCommandType =
  'setRead' | 'setStarred' | 'move' | 'delete' | 'saveDraft' | 'send';

export interface MailCommand {
  readonly id: string;
  readonly accountId: string;
  readonly messageId?: string;
  readonly type: MailCommandType;
  readonly status: 'pending' | 'confirmed' | 'failed';
  readonly errorCode?: string;
  readonly createdAt: string;
}

export interface MailPage<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

export interface MailOperationContext {
  readonly actorId: string;
  readonly locale?: string;
  readonly signal?: AbortSignal;
}

export interface MailAuthorizationStartInput {
  readonly provider: MailProviderIdentity;
  readonly redirectUri: string;
  readonly state: string;
  readonly scopes?: readonly string[];
}

export interface MailAuthorizationStartResult {
  readonly authorizationUrl: string;
  readonly state: string;
  readonly expiresAt?: string;
}

export interface MailAuthorizationCallbackInput {
  readonly provider: MailProviderIdentity;
  readonly redirectUri: string;
  readonly state: string;
  readonly code: string;
}

export interface MailListMessagesInput {
  readonly accountIds?: readonly string[];
  readonly folderIds?: readonly string[];
  readonly conversationId?: string;
  readonly query?: string;
  readonly unread?: boolean;
  readonly starred?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface MailListConversationsInput {
  readonly accountIds?: readonly string[];
  readonly folderIds?: readonly string[];
  readonly query?: string;
  readonly unread?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface MailListJobsInput {
  readonly accountIds?: readonly string[];
  readonly types?: readonly MailJobType[];
  readonly statuses?: readonly MailJobStatus[];
  readonly cursor?: string;
  readonly limit?: number;
}

export interface MailComposeInput {
  readonly accountId: string;
  readonly identityId: string;
  readonly to: readonly MailAddress[];
  readonly cc?: readonly MailAddress[];
  readonly bcc?: readonly MailAddress[];
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly attachmentIds?: readonly string[];
  readonly inReplyToMessageId?: string;
  readonly forwardOfMessageId?: string;
  readonly scheduledAt?: string;
  readonly idempotencyKey: string;
}

export interface MailDraftResult {
  readonly message: MailMessage;
  readonly command: MailCommand;
}

export type MailSubmissionStatus =
  'pending' | 'submitting' | 'accepted' | 'failed' | 'unknown';

export interface MailSubmission {
  readonly id: string;
  readonly accountId: string;
  readonly status: MailSubmissionStatus;
  readonly providerMessageId?: string;
  readonly error?: MailProviderError;
}

export type MailPublicError = Omit<MailProviderError, 'message'>;

export interface MailSubmissionView {
  readonly id: string;
  readonly accountId: string;
  readonly status: MailSubmissionStatus;
  readonly providerMessageId?: string;
  readonly error?: MailPublicError;
}

export interface MailAttachmentContent {
  readonly fileName: string;
  readonly contentType: string;
  readonly size?: number;
  readonly stream: ReadableStream<Uint8Array>;
}

export interface MailService {
  listAccounts(
    context: MailOperationContext,
  ): Promise<readonly MailAccountView[]>;
  listIdentities(
    context: MailOperationContext,
    accountId: string,
  ): Promise<readonly MailIdentity[]>;
  startSync(
    context: MailOperationContext,
    input: MailStartSyncInput,
  ): Promise<MailSyncRunView>;
  getSyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRunView | undefined>;
  listMessages(
    context: MailOperationContext,
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>>;
  getMessage(
    context: MailOperationContext,
    accountId: string,
    messageId: string,
  ): Promise<MailMessage | undefined>;
  sendMessage(
    context: MailOperationContext,
    input: MailComposeInput,
  ): Promise<MailSubmissionView>;
}

export const MAIL_PROVIDER_ERROR_CATEGORIES: readonly [
  'authentication',
  'configuration',
  'recipient',
  'content',
  'rate_limit',
  'network',
  'timeout',
  'provider',
  'unknown',
] = [
  'authentication',
  'configuration',
  'recipient',
  'content',
  'rate_limit',
  'network',
  'timeout',
  'provider',
  'unknown',
];

export type MailProviderErrorCategory =
  (typeof MAIL_PROVIDER_ERROR_CATEGORIES)[number];

export interface MailProviderError {
  readonly code: string;
  readonly message: string;
  readonly category: MailProviderErrorCategory;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
}

export type MailProviderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: MailProviderError };

export interface MailAuthorizedAccount {
  readonly address: string;
  readonly displayName?: string;
  readonly authorizationSubject?: string;
  readonly credentialReference: string;
  readonly scopes: readonly string[];
  readonly credentialExpiresAt?: string;
}

export interface MailProviderAuthorizationCallbackInput {
  readonly redirectUri: string;
  readonly state: string;
  readonly code: string;
  readonly signal?: AbortSignal;
}

export interface MailProviderChangePage {
  readonly messages: readonly NormalizedMailMessage[];
  readonly deletedProviderMessageIds: readonly string[];
  readonly nextCursor: MailSyncCursor;
  readonly hasMore: boolean;
}

export interface MailProviderListChangesInput {
  readonly cursor?: MailSyncCursor;
  readonly limit: number;
  readonly signal?: AbortSignal;
}

export interface MailProviderListMessagesInput {
  readonly providerFolderIds?: readonly string[];
  readonly receivedAfter?: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface MailProviderMessagePage {
  readonly messages: readonly NormalizedMailMessage[];
  readonly nextCursor?: string;
}

export interface MailProviderSendInput {
  readonly trackingId: string;
  readonly identity: MailIdentity;
  readonly message: MailProviderMessageInput;
  readonly signal?: AbortSignal;
}

export interface NormalizedMailAttachment {
  readonly providerAttachmentId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly contentId?: string;
  readonly inline: boolean;
}

/** Provider-normalized message before mail core assigns local identifiers. */
export interface NormalizedMailMessage {
  readonly providerMessageId: string;
  readonly internetMessageId?: string;
  readonly providerConversationId?: string;
  readonly providerFolderIds: readonly string[];
  readonly from?: MailAddress;
  readonly to: readonly MailAddress[];
  readonly cc: readonly MailAddress[];
  readonly bcc: readonly MailAddress[];
  readonly replyTo: readonly MailAddress[];
  readonly inReplyTo?: string;
  readonly references: readonly string[];
  readonly subject: string;
  readonly preview?: string;
  readonly text?: string;
  readonly html?: string;
  readonly receivedAt?: string;
  readonly sentAt?: string;
  readonly read: boolean;
  readonly starred: boolean;
  readonly draft: boolean;
  readonly attachments: readonly NormalizedMailAttachment[];
}

export interface NormalizedMailFolder {
  readonly providerFolderId: string;
  readonly type: MailFolderType;
  readonly name: string;
  readonly unreadCount?: number;
  readonly kind: 'folder' | 'label';
}

export interface MailProviderAttachmentInput {
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly contentId?: string;
  readonly inline: boolean;
  open(): Promise<ReadableStream<Uint8Array>>;
}

/** Immutable snapshot prepared by mail core for one Provider submission. */
export interface MailProviderMessageInput {
  readonly to: readonly MailAddress[];
  readonly cc: readonly MailAddress[];
  readonly bcc: readonly MailAddress[];
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly attachments: readonly MailProviderAttachmentInput[];
  readonly internetMessageId?: string;
  readonly inReplyTo?: string;
  readonly references: readonly string[];
  readonly providerConversationId?: string;
}

export type MailProviderSendResult =
  | {
      readonly status: 'accepted';
      readonly providerMessageId?: string;
      readonly internetMessageId?: string;
    }
  | {
      readonly status: 'failed';
      readonly error: MailProviderError;
    }
  | {
      readonly status: 'submission_unknown';
      readonly error: MailProviderError;
    };

export interface MailProviderAdapter {
  readonly identity: MailProviderIdentity;
  readonly capabilities: MailProviderCapabilities;
  refreshAuthorization?(
    signal?: AbortSignal,
  ): Promise<MailProviderResult<MailAuthorizedAccount>>;
  listFolders?(
    signal?: AbortSignal,
  ): Promise<MailProviderResult<readonly NormalizedMailFolder[]>>;
  listMessages?(
    input: MailProviderListMessagesInput,
  ): Promise<MailProviderResult<MailProviderMessagePage>>;
  listChanges?(
    input: MailProviderListChangesInput,
  ): Promise<MailProviderResult<MailProviderChangePage>>;
  getCurrentSyncCursor?(
    signal?: AbortSignal,
  ): Promise<MailProviderResult<MailSyncCursor>>;
  getMessage?(
    providerMessageId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<NormalizedMailMessage>>;
  getAttachment?(
    providerMessageId: string,
    providerAttachmentId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<MailAttachmentContent>>;
  sendMessage?(input: MailProviderSendInput): Promise<MailProviderSendResult>;
  saveDraft?(
    input: MailProviderSendInput,
  ): Promise<MailProviderResult<NormalizedMailMessage>>;
  setRead?(
    providerMessageId: string,
    read: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>>;
  setStarred?(
    providerMessageId: string,
    starred: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>>;
  moveMessage?(
    providerMessageId: string,
    providerFolderId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<MailProviderMoveResult>>;
  deleteMessage?(
    providerMessageId: string,
    permanently: boolean,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>>;
  close?(): Promise<void>;
}

export interface MailProviderContext {
  readonly publicBasePath: string;
}

export interface MailProviderMoveResult {
  /** Some Providers assign a new message identifier when moving a message. */
  readonly providerMessageId: string;
}

export interface MailProviderAuthorization<
  TConfig extends MailProviderConfig = MailProviderConfig,
> {
  start(
    context: MailProviderContext,
    config: TConfig,
    input: Omit<MailAuthorizationStartInput, 'provider'>,
  ): Promise<MailProviderResult<MailAuthorizationStartResult>>;
  complete(
    context: MailProviderContext,
    config: TConfig,
    input: MailProviderAuthorizationCallbackInput,
  ): Promise<MailProviderResult<MailAuthorizedAccount>>;
}

export interface MailProviderDefinition<
  TConfig extends MailProviderConfig = MailProviderConfig,
> {
  readonly type: TConfig['type'];
  readonly label: string;
  readonly capabilities: MailProviderCapabilities;
  validateConfig?(config: TConfig): void;
  readonly authorization?: MailProviderAuthorization<TConfig>;
  createAdapter(
    context: MailProviderContext,
    config: TConfig,
    account: MailAccount,
  ): Promise<MailProviderAdapter>;
}

export interface MailProviderRegistry {
  register(definition: MailProviderDefinition): MailProviderRegistry;
  definition(type: string): MailProviderDefinition | undefined;
  definitions(): readonly MailProviderDefinition[];
}

export interface MailProviderAdapterResolver {
  resolve(
    account: MailAccount,
    signal?: AbortSignal,
  ): Promise<MailProviderAdapter>;
}

export interface MailSyncBatch {
  readonly accountId: string;
  readonly folders: readonly NormalizedMailFolder[];
  readonly messages: readonly NormalizedMailMessage[];
  readonly deletedProviderMessageIds: readonly string[];
  readonly previousCursor?: MailSyncCursor;
  readonly nextCursor: MailSyncCursor;
}

export interface MailSyncStepCommit {
  readonly run: MailSyncRun;
  readonly folders?: readonly NormalizedMailFolder[];
  readonly messages: readonly NormalizedMailMessage[];
  readonly deletedProviderMessageIds?: readonly string[];
  readonly phase: MailSyncPhase;
  readonly status: MailSyncRunStatus;
  readonly historyCursor?: string;
  readonly baselineCursor?: MailSyncCursor;
  readonly changeCursor?: MailSyncCursor;
  readonly createNextTask: boolean;
}

export type MailOutboxStatus = 'pending' | 'publishing' | 'published';

export interface MailSyncMailboxTaskPayload {
  readonly version: 1;
  readonly syncRunId: string;
  readonly expectedRevision: number;
  readonly expectedPhase: MailSyncPhase;
}

export interface MailOutboxRecord {
  readonly id: string;
  readonly type: 'syncMailbox';
  readonly aggregateId: string;
  readonly deduplicationKey: string;
  readonly payload: MailSyncMailboxTaskPayload;
  readonly status: MailOutboxStatus;
  readonly attempts: number;
  readonly availableAt: string;
  readonly leaseToken?: string;
  readonly leaseExpiresAt?: string;
  readonly createdAt: string;
  readonly publishedAt?: string;
}

export interface MailCreateSyncRunInput {
  readonly id: string;
  readonly accountId: string;
  readonly requestedBy: string;
  readonly mode: MailSyncMode;
  readonly policy: MailInitialSyncPolicy;
}

export interface MailStoredSubmission extends MailSubmission {
  readonly requestFingerprint: string;
}

export interface MailStore {
  getAccount(accountId: string): Promise<MailAccount | undefined>;
  listAccounts(userId: string): Promise<readonly MailAccount[]>;
  saveAccount(account: MailAccount): Promise<MailAccount>;
  listIdentities(accountId: string): Promise<readonly MailIdentity[]>;
  replaceIdentities(
    accountId: string,
    identities: readonly MailIdentity[],
  ): Promise<void>;
  getIdentity(identityId: string): Promise<MailIdentity | undefined>;
  listFolders(accountId: string): Promise<readonly MailFolder[]>;
  commitSyncBatch(batch: MailSyncBatch): Promise<void>;
  listMessages(
    userId: string,
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>>;
  getMessage(
    userId: string,
    accountId: string,
    messageId: string,
  ): Promise<MailMessage | undefined>;
  getSyncCursor(accountId: string): Promise<MailSyncCursor | undefined>;
  createSyncRun(input: MailCreateSyncRunInput): Promise<MailSyncRun>;
  findActiveSyncRun(accountId: string): Promise<MailSyncRun | undefined>;
  getSyncRun(syncRunId: string): Promise<MailSyncRun | undefined>;
  claimSyncRun(
    syncRunId: string,
    expectedRevision: number,
    expectedPhase: MailSyncPhase,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<MailSyncRun | undefined>;
  commitSyncStep(input: MailSyncStepCommit): Promise<MailSyncRun>;
  failSyncRun(run: MailSyncRun, error: MailProviderError): Promise<MailSyncRun>;
  releaseSyncRun(
    run: MailSyncRun,
    error: MailProviderError,
    availableAt: string,
  ): Promise<MailSyncRun>;
  getSubmissionByIdempotencyKey(
    accountId: string,
    idempotencyKey: string,
  ): Promise<MailStoredSubmission | undefined>;
  createSubmission(
    submission: MailSubmission,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<MailStoredSubmission>;
  claimSubmission(
    submissionId: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<boolean>;
  recoverExpiredSubmissions(now: string): Promise<number>;
  finishSubmission(
    submission: MailSubmission,
    leaseToken: string,
  ): Promise<MailSubmission>;
  claimOutbox(
    now: string,
    leaseToken: string,
    leaseExpiresAt: string,
    limit: number,
  ): Promise<readonly MailOutboxRecord[]>;
  markOutboxPublished(
    outboxId: string,
    leaseToken: string,
    publishedAt: string,
  ): Promise<boolean>;
  releaseOutbox(
    outboxId: string,
    leaseToken: string,
    availableAt: string,
  ): Promise<boolean>;
}

export function defineMailProviderDefinition<
  TConfig extends MailProviderConfig,
>(
  definition: MailProviderDefinition<TConfig>,
): MailProviderDefinition<TConfig> {
  return definition;
}

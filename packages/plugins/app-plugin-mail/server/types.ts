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
  readonly status: MailAccountStatus;
  readonly syncCursor?: MailSyncCursor;
  readonly isDefault: boolean;
}

/** API-safe account metadata. Credential references remain inside mail core. */
export type MailAccountView = Omit<
  MailAccount,
  'credentialReference' | 'authorizationSubject' | 'syncCursor'
>;

export interface MailManagedAccountView extends MailAccountView {
  readonly canSync: boolean;
}

export interface MailIdentity {
  readonly id: string;
  readonly accountId: string;
  readonly address: string;
  readonly displayName?: string;
  readonly isPrimary: boolean;
  readonly canSend: boolean;
}

export interface MailSignature {
  readonly id: string;
  readonly identityId: string;
  readonly name: string;
  readonly text: string;
  readonly html?: string;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MailSaveSignatureInput {
  readonly id?: string;
  readonly accountId: string;
  readonly identityId: string;
  readonly name: string;
  readonly text: string;
  readonly html?: string | null;
  readonly isDefault?: boolean;
}

export interface MailUpdateIdentityInput {
  readonly accountId: string;
  readonly identityId: string;
  readonly displayName?: string | null;
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
  readonly providerDraftId?: string;
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
  /** User-owned metadata that is never synchronized to the Provider. */
  readonly note?: string;
  readonly todo: boolean;
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
  readonly ownerId?: string;
}

export interface MailSaveTemplateInput {
  readonly id?: string;
  readonly name: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
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
  readonly folderCursor?: string;
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
  /** Management views use this to avoid exposing actions for another user. */
  readonly canManage?: boolean;
}

export interface MailStartSyncInput {
  readonly accountId: string;
  readonly mode?: MailSyncMode;
  readonly receivedAfter?: string;
  readonly maxMessages?: number;
  readonly batchSize?: number;
}

export interface MailUpdateAccountInput {
  readonly accountId: string;
  readonly status?: 'active' | 'suspended';
  readonly isDefault?: boolean;
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
  readonly codeChallenge: string;
  readonly scopes?: readonly string[];
}

export interface MailAuthorizationStartResult {
  readonly authorizationUrl: string;
  readonly state: string;
  readonly expiresAt?: string;
}

export interface MailStartAuthorizationInput {
  readonly provider: MailProviderIdentity;
  readonly redirectUri: string;
  readonly scopes?: readonly string[];
}

export interface MailCompleteAuthorizationInput {
  readonly state: string;
  readonly code?: string;
  readonly error?: string;
  readonly errorDescription?: string;
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

export interface MailListConversationMessagesInput {
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
  /** Undefined selects the default signature; null explicitly selects none. */
  readonly signatureId?: string | null;
  readonly to: readonly MailAddress[];
  readonly cc?: readonly MailAddress[];
  readonly bcc?: readonly MailAddress[];
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly attachmentIds?: readonly string[];
  /** Existing draft attachments that should remain after an update. */
  readonly retainedAttachmentIds?: readonly string[];
  readonly inReplyToMessageId?: string;
  readonly forwardOfMessageId?: string;
  readonly scheduledAt?: string;
  readonly draftMessageId?: string;
  readonly idempotencyKey: string;
}

export interface MailBulkComposeInput extends Omit<
  MailComposeInput,
  'to' | 'cc' | 'bcc'
> {
  readonly recipients: readonly MailAddress[];
}

export interface MailUpdateMessageInput {
  readonly accountId: string;
  readonly messageId: string;
  readonly read?: boolean;
  readonly starred?: boolean;
  readonly note?: string | null;
  readonly todo?: boolean;
}

export interface MailUpdateMessageLabelsInput {
  readonly accountId: string;
  readonly messageId: string;
  readonly addLabelIds?: readonly string[];
  readonly removeLabelIds?: readonly string[];
}

export interface MailMoveMessageInput {
  readonly accountId: string;
  readonly messageId: string;
  readonly providerFolderId: string;
}

export interface MailDeleteMessageInput {
  readonly accountId: string;
  readonly messageId: string;
  readonly permanently?: boolean;
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
  readonly scheduledAt?: string;
  readonly error?: MailProviderError;
}

export type MailPublicError = Omit<MailProviderError, 'message'>;

export interface MailSubmissionView {
  readonly id: string;
  readonly accountId: string;
  readonly status: MailSubmissionStatus;
  readonly providerMessageId?: string;
  readonly scheduledAt?: string;
  readonly error?: MailPublicError;
}

export interface MailSubmissionLogView extends MailSubmissionView {
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MailManagedOperationLogsView {
  readonly accounts: readonly MailAccountView[];
  readonly syncRuns: readonly MailSyncRunView[];
  readonly submissions: readonly MailSubmissionLogView[];
}

export interface MailAttachmentContent {
  readonly fileName: string;
  readonly contentType: string;
  readonly size?: number;
  readonly stream: ReadableStream<Uint8Array>;
}

export interface MailOutboundAttachment {
  readonly id: string;
  readonly userId: string;
  readonly disk: string;
  readonly key: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export type MailOutboundAttachmentView = Pick<
  MailOutboundAttachment,
  'id' | 'fileName' | 'contentType' | 'size' | 'expiresAt'
>;

export interface MailUploadAttachmentInput {
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly stream: ReadableStream<Uint8Array>;
}

export interface MailOutboundAttachmentStorage {
  create(
    userId: string,
    input: MailUploadAttachmentInput,
  ): Promise<MailOutboundAttachmentView>;
  open(
    userId: string,
    attachmentId: string,
  ): Promise<{
    readonly attachment: MailOutboundAttachment;
    readonly stream: ReadableStream<Uint8Array>;
  }>;
  cleanupExpired?(now: string): Promise<number>;
}

export interface MailService {
  listProviders(): Promise<readonly MailProviderView[]>;
  startAuthorization(
    context: MailOperationContext,
    input: MailStartAuthorizationInput,
  ): Promise<MailAuthorizationStartResult>;
  completeAuthorization(
    input: MailCompleteAuthorizationInput,
  ): Promise<MailAccountView>;
  listAccounts(
    context: MailOperationContext,
  ): Promise<readonly MailAccountView[]>;
  updateAccount(
    context: MailOperationContext,
    input: MailUpdateAccountInput,
  ): Promise<MailAccountView>;
  removeAccount(
    context: MailOperationContext,
    accountId: string,
  ): Promise<void>;
  listManagedAccounts(
    context: MailOperationContext,
  ): Promise<readonly MailManagedAccountView[]>;
  listManagedOperationLogs(
    context: MailOperationContext,
  ): Promise<MailManagedOperationLogsView>;
  listFolders(
    context: MailOperationContext,
    accountId: string,
  ): Promise<readonly MailFolder[]>;
  listIdentities(
    context: MailOperationContext,
    accountId: string,
  ): Promise<readonly MailIdentity[]>;
  updateIdentity(
    context: MailOperationContext,
    input: MailUpdateIdentityInput,
  ): Promise<MailIdentity>;
  listSignatures(
    context: MailOperationContext,
    accountId: string,
    identityId: string,
  ): Promise<readonly MailSignature[]>;
  saveSignature(
    context: MailOperationContext,
    input: MailSaveSignatureInput,
  ): Promise<MailSignature>;
  deleteSignature(
    context: MailOperationContext,
    accountId: string,
    identityId: string,
    signatureId: string,
  ): Promise<void>;
  createLabel(
    context: MailOperationContext,
    accountId: string,
    name: string,
  ): Promise<MailFolder>;
  updateMessageLabels(
    context: MailOperationContext,
    input: MailUpdateMessageLabelsInput,
  ): Promise<MailMessage>;
  getUnreadCount(context: MailOperationContext): Promise<number>;
  startSync(
    context: MailOperationContext,
    input: MailStartSyncInput,
  ): Promise<MailSyncRunView>;
  getSyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRunView | undefined>;
  listSyncRuns(
    context: MailOperationContext,
  ): Promise<readonly MailSyncRunView[]>;
  retrySyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRunView>;
  cancelSyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRunView>;
  listSubmissions(
    context: MailOperationContext,
  ): Promise<readonly MailSubmissionLogView[]>;
  listMessages(
    context: MailOperationContext,
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>>;
  getMessage(
    context: MailOperationContext,
    accountId: string,
    messageId: string,
  ): Promise<MailMessage | undefined>;
  getAttachment(
    context: MailOperationContext,
    accountId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<MailAttachmentContent>;
  listConversationMessages(
    context: MailOperationContext,
    accountId: string,
    conversationId: string,
    input?: MailListConversationMessagesInput,
  ): Promise<MailPage<MailMessage>>;
  sendMessage(
    context: MailOperationContext,
    input: MailComposeInput,
  ): Promise<MailSubmissionView>;
  sendBulk(
    context: MailOperationContext,
    input: MailBulkComposeInput,
  ): Promise<readonly MailSubmissionView[]>;
  saveDraft(
    context: MailOperationContext,
    input: MailComposeInput,
  ): Promise<MailMessage>;
  uploadAttachment(
    context: MailOperationContext,
    input: MailUploadAttachmentInput,
  ): Promise<MailOutboundAttachmentView>;
  listTemplates(
    context: MailOperationContext,
  ): Promise<readonly MailTemplate[]>;
  saveTemplate(
    context: MailOperationContext,
    input: MailSaveTemplateInput,
  ): Promise<MailTemplate>;
  deleteTemplate(
    context: MailOperationContext,
    templateId: string,
  ): Promise<void>;
  updateMessage(
    context: MailOperationContext,
    input: MailUpdateMessageInput,
  ): Promise<MailMessage>;
  moveMessage(
    context: MailOperationContext,
    input: MailMoveMessageInput,
  ): Promise<MailMessage>;
  deleteMessage(
    context: MailOperationContext,
    input: MailDeleteMessageInput,
  ): Promise<void>;
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
  readonly identities?: readonly MailAuthorizedIdentity[];
}

export interface MailAuthorizedIdentity {
  readonly address: string;
  readonly displayName?: string;
  readonly signatureText?: string;
  readonly signatureHtml?: string;
  readonly isPrimary: boolean;
  readonly canSend: boolean;
}

export interface MailProviderAuthorizationCallbackInput {
  readonly redirectUri: string;
  readonly state: string;
  readonly code: string;
  readonly codeVerifier: string;
  readonly scopes: readonly string[];
  readonly signal?: AbortSignal;
}

export interface MailProviderChangePage {
  readonly messages: readonly NormalizedMailMessage[];
  readonly removedFromFolders?: readonly MailProviderFolderRemoval[];
  readonly deletedProviderMessageIds: readonly string[];
  readonly nextCursor: MailSyncCursor;
  readonly hasMore: boolean;
}

export interface MailProviderFolderRemoval {
  readonly providerMessageId: string;
  readonly providerFolderId: string;
}

export interface MailProviderListChangesInput {
  readonly cursor?: MailSyncCursor;
  readonly limit: number;
  readonly signal?: AbortSignal;
}

export interface MailProviderListFoldersInput {
  readonly cursor?: string;
  readonly limit: number;
  readonly signal?: AbortSignal;
}

export interface MailProviderFolderPage {
  readonly folders: readonly NormalizedMailFolder[];
  readonly nextCursor?: string;
  /** Exact Provider folder scope, present only on the final page. */
  readonly completeProviderFolderIds?: readonly string[];
}

export interface MailProviderListMessagesInput {
  readonly providerFolderIds?: readonly string[];
  readonly receivedAfter?: string;
  /** Provider baseline seed captured before the initial history pass starts. */
  readonly baselineCursor?: MailSyncCursor;
  readonly cursor?: string;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface MailProviderMessagePage {
  readonly messages: readonly NormalizedMailMessage[];
  readonly nextCursor?: string;
  /**
   * Pre-history checkpoint. A Provider may return empty preparation pages while
   * establishing this checkpoint before it returns bounded history pages.
   */
  readonly syncCursor?: MailSyncCursor;
}

export interface MailProviderSendInput {
  readonly trackingId: string;
  readonly identity: MailIdentity;
  readonly message: MailProviderMessageInput;
  readonly signal?: AbortSignal;
}

export interface MailProviderPushSubscription {
  readonly accountId: string;
  readonly provider: MailProviderIdentity;
  readonly providerSubscriptionId: string;
  readonly configurationFingerprint: string;
  readonly renewAfter: string;
  readonly expiresAt: string;
  readonly updatedAt: string;
}

export interface MailPushSubscriptionMaintenanceLease {
  readonly leaseToken: string;
  readonly subscription?: MailProviderPushSubscription;
}

export interface MailProviderUpsertPushSubscriptionInput {
  readonly notificationUrl: string;
  readonly clientState: string;
  readonly providerSubscriptionId?: string;
  readonly signal?: AbortSignal;
}

export interface MailProviderUpsertPushSubscriptionResult {
  readonly providerSubscriptionId: string;
  readonly renewAfter: string;
  readonly expiresAt: string;
}

export interface MailProviderPushNotification {
  readonly providerSubscriptionId?: string;
  readonly accountAddress?: string;
  readonly clientState?: string;
}

export interface MailProviderPushNotificationInput {
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface MailProviderPushNotificationResult {
  readonly challengeResponse?: string;
  readonly notifications: readonly MailProviderPushNotification[];
}

export interface MailProviderPushNotifications {
  parse(
    input: MailProviderPushNotificationInput,
  ): MailProviderResult<MailProviderPushNotificationResult>;
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
  readonly providerDraftId?: string;
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

export interface MailProviderUpdateLabelsInput {
  readonly addLabelIds: readonly string[];
  readonly removeLabelIds: readonly string[];
  readonly signal?: AbortSignal;
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
  /** Provider attachment IDs retained from an existing draft. */
  readonly retainedProviderAttachmentIds?: readonly string[];
  readonly internetMessageId?: string;
  readonly inReplyTo?: string;
  readonly references: readonly string[];
  readonly providerConversationId?: string;
  /** Existing Provider draft message to update or send. */
  readonly draftProviderMessageId?: string;
  readonly draftProviderDraftId?: string;
  /** Provider message used as the reply target, resolved by Mail Core. */
  readonly replyToProviderMessageId?: string;
  /** Provider message used as the forward source, resolved by Mail Core. */
  readonly forwardOfProviderMessageId?: string;
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
  readonly pushNotificationsConfigured?: boolean;
  refreshAuthorization?(
    signal?: AbortSignal,
  ): Promise<MailProviderResult<MailAuthorizedAccount>>;
  listFolders?(
    input: MailProviderListFoldersInput,
  ): Promise<MailProviderResult<MailProviderFolderPage>>;
  createLabel?(
    name: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<NormalizedMailFolder>>;
  updateLabels?(
    providerMessageId: string,
    input: MailProviderUpdateLabelsInput,
  ): Promise<MailProviderResult<void>>;
  reconcileSyncCursor?(
    cursor: MailSyncCursor | undefined,
    providerFolderIds: readonly string[],
  ): MailProviderResult<MailSyncCursor>;
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
  updateDraft?(
    providerMessageId: string,
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
  upsertPushSubscription?(
    input: MailProviderUpsertPushSubscriptionInput,
  ): Promise<MailProviderResult<MailProviderUpsertPushSubscriptionResult>>;
  deletePushSubscription?(
    providerSubscriptionId: string,
    signal?: AbortSignal,
  ): Promise<MailProviderResult<void>>;
  close?(): Promise<void>;
}

export interface MailProviderContext {
  readonly publicBasePath: string;
  readonly credentials: MailCredentialVault;
}

export interface MailCredentialVault {
  put(
    value: unknown,
    options?: {
      readonly purpose?: 'account' | 'authorization';
      readonly expiresAt?: string;
    },
  ): Promise<string>;
  get<T>(reference: string): Promise<T>;
  replace(reference: string, value: unknown): Promise<void>;
  getOrRefresh<T>(
    reference: string,
    isFresh: (value: T) => boolean,
    refresh: (value: T) => Promise<T>,
  ): Promise<T>;
  delete(reference: string): Promise<void>;
  deleteExpired?(now: string): Promise<number>;
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
  readonly push?: MailProviderPushNotifications;
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

export interface MailProviderView {
  readonly type: string;
  readonly name: string;
  readonly label: string;
  readonly capabilities: MailProviderCapabilities;
}

export interface MailAuthorizationTransaction {
  readonly stateHash: string;
  readonly userId: string;
  readonly provider: MailProviderIdentity;
  readonly redirectUri: string;
  readonly verifierCredentialReference: string;
  readonly scopes: readonly string[];
  readonly expiresAt: string;
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
  readonly removedFromFolders?: readonly MailProviderFolderRemoval[];
  readonly deletedProviderMessageIds: readonly string[];
  readonly previousCursor?: MailSyncCursor;
  readonly nextCursor: MailSyncCursor;
}

export interface MailSyncStepCommit {
  readonly run: MailSyncRun;
  readonly folders?: readonly NormalizedMailFolder[];
  readonly completeProviderFolderIds?: readonly string[];
  readonly messages: readonly NormalizedMailMessage[];
  readonly removedFromFolders?: readonly MailProviderFolderRemoval[];
  readonly deletedProviderMessageIds?: readonly string[];
  readonly phase: MailSyncPhase;
  readonly status: MailSyncRunStatus;
  readonly historyCursor?: string;
  readonly folderCursor?: string;
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

export interface MailScheduledSendTaskPayload {
  readonly version: 1;
  readonly submissionId: string;
}

interface MailOutboxRecordBase {
  readonly id: string;
  readonly aggregateId: string;
  readonly deduplicationKey: string;
  readonly status: MailOutboxStatus;
  readonly attempts: number;
  readonly availableAt: string;
  readonly leaseToken?: string;
  readonly leaseExpiresAt?: string;
  readonly createdAt: string;
  readonly publishedAt?: string;
}

export type MailOutboxRecord = MailOutboxRecordBase &
  (
    | {
        readonly type: 'syncMailbox';
        readonly payload: MailSyncMailboxTaskPayload;
      }
    | {
        readonly type: 'sendScheduledMail';
        readonly payload: MailScheduledSendTaskPayload;
      }
  );

export interface MailCreateSyncRunInput {
  readonly id: string;
  readonly accountId: string;
  readonly requestedBy: string;
  readonly mode: MailSyncMode;
  readonly policy: MailInitialSyncPolicy;
}

export interface MailStoredSubmission extends MailSubmission {
  readonly requestFingerprint: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MailScheduledSubmission {
  readonly actorId: string;
  readonly input: MailComposeInput;
  readonly submission: MailStoredSubmission;
}

export interface MailStore {
  createAuthorizationTransaction(
    transaction: MailAuthorizationTransaction,
  ): Promise<void>;
  consumeAuthorizationTransaction(
    stateHash: string,
    now: string,
  ): Promise<MailAuthorizationTransaction | undefined>;
  deleteExpiredAuthorizationTransactions?(now: string): Promise<number>;
  getAccount(accountId: string): Promise<MailAccount | undefined>;
  findAccountByProviderIdentity(
    provider: MailProviderIdentity,
    address: string,
    authorizationSubject?: string,
  ): Promise<MailAccount | undefined>;
  listAccounts(userId: string): Promise<readonly MailAccount[]>;
  listAllAccounts(): Promise<readonly MailAccount[]>;
  saveAccount(account: MailAccount): Promise<MailAccount>;
  markAccountRemoving(accountId: string, userId: string): Promise<boolean>;
  setDefaultAccount(userId: string, accountId: string): Promise<MailAccount>;
  deleteAccount(accountId: string): Promise<boolean>;
  getPushSubscription(
    accountId: string,
  ): Promise<MailProviderPushSubscription | undefined>;
  findPushSubscription(
    provider: MailProviderIdentity,
    providerSubscriptionId: string,
  ): Promise<MailProviderPushSubscription | undefined>;
  findActiveAccountsForPush(
    provider: MailProviderIdentity,
    providerSubscriptionIds: readonly string[],
    accountAddresses: readonly string[],
  ): Promise<readonly MailAccount[]>;
  savePushSubscription(
    subscription: MailProviderPushSubscription,
    leaseToken?: string,
  ): Promise<boolean>;
  deletePushSubscription(accountId: string): Promise<boolean>;
  claimPushSubscriptionMaintenance(
    account: MailAccount,
    leaseToken: string,
    now: string,
    leaseExpiresAt: string,
  ): Promise<MailPushSubscriptionMaintenanceLease | undefined>;
  releasePushSubscriptionMaintenance(
    accountId: string,
    leaseToken: string,
  ): Promise<void>;
  renewPushSubscriptionMaintenance(
    accountId: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<boolean>;
  markPushSubscriptionReplacementNeeded(
    accountId: string,
    leaseToken: string,
    updatedAt: string,
  ): Promise<boolean>;
  saveAuthorizedAccount(
    account: MailAccount,
    identities: readonly MailIdentity[],
    signatures?: readonly MailSignature[],
  ): Promise<void>;
  listIdentities(accountId: string): Promise<readonly MailIdentity[]>;
  replaceIdentities(
    accountId: string,
    identities: readonly MailIdentity[],
  ): Promise<void>;
  getIdentity(identityId: string): Promise<MailIdentity | undefined>;
  updateIdentity(
    identityId: string,
    patch: Pick<MailIdentity, 'displayName'>,
  ): Promise<MailIdentity | undefined>;
  listSignatures(identityId: string): Promise<readonly MailSignature[]>;
  getSignature(signatureId: string): Promise<MailSignature | undefined>;
  saveSignature(signature: MailSignature): Promise<MailSignature>;
  deleteSignature(identityId: string, signatureId: string): Promise<boolean>;
  listFolders(accountId: string): Promise<readonly MailFolder[]>;
  saveFolder(
    accountId: string,
    folder: NormalizedMailFolder,
  ): Promise<MailFolder>;
  commitSyncBatch(batch: MailSyncBatch): Promise<void>;
  saveMessage(
    accountId: string,
    message: NormalizedMailMessage,
  ): Promise<MailMessage>;
  createOutboundAttachment(attachment: MailOutboundAttachment): Promise<void>;
  getOutboundAttachment(
    userId: string,
    attachmentId: string,
  ): Promise<MailOutboundAttachment | undefined>;
  extendOutboundAttachments(
    userId: string,
    attachmentIds: readonly string[],
    expiresAt: string,
  ): Promise<void>;
  listExpiredOutboundAttachments(
    now: string,
    limit: number,
    after?: Pick<MailOutboundAttachment, 'expiresAt' | 'id'>,
  ): Promise<readonly MailOutboundAttachment[]>;
  deleteOutboundAttachment(attachmentId: string): Promise<boolean>;
  listTemplates(ownerId: string): Promise<readonly MailTemplate[]>;
  saveTemplate(template: MailTemplate): Promise<MailTemplate>;
  deleteTemplate(ownerId: string, templateId: string): Promise<boolean>;
  listMessages(
    userId: string,
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>>;
  getMessage(
    userId: string,
    accountId: string,
    messageId: string,
  ): Promise<MailMessage | undefined>;
  listConversationMessages(
    userId: string,
    accountId: string,
    conversationId: string,
    input?: MailListConversationMessagesInput,
  ): Promise<MailPage<MailMessage>>;
  updateMessageState(
    accountId: string,
    messageId: string,
    state: {
      readonly read?: boolean;
      readonly starred?: boolean;
      readonly note?: string | null;
      readonly todo?: boolean;
    },
  ): Promise<MailMessage | undefined>;
  updateMessageLabels(
    accountId: string,
    messageId: string,
    addLabelIds: readonly string[],
    removeLabelIds: readonly string[],
  ): Promise<MailMessage | undefined>;
  countUnreadMessages(userId: string): Promise<number>;
  moveMessage(
    accountId: string,
    messageId: string,
    providerMessageId: string,
    providerFolderId: string,
  ): Promise<MailMessage | undefined>;
  deleteMessage(accountId: string, messageId: string): Promise<boolean>;
  getSyncCursor(accountId: string): Promise<MailSyncCursor | undefined>;
  clearSyncCursor(accountId: string): Promise<void>;
  markPushSyncPending(accountId: string, requestToken: string): Promise<void>;
  markPushSyncPendingBatch(
    accountIds: readonly string[],
    requestToken: string,
  ): Promise<void>;
  clearPushSyncPending(accountId: string, requestToken: string): Promise<void>;
  createSyncRun(input: MailCreateSyncRunInput): Promise<MailSyncRun>;
  findActiveSyncRun(accountId: string): Promise<MailSyncRun | undefined>;
  getSyncRun(syncRunId: string): Promise<MailSyncRun | undefined>;
  listSyncRuns(userId: string): Promise<readonly MailSyncRun[]>;
  listAllSyncRuns(): Promise<readonly MailSyncRun[]>;
  cancelSyncRun(syncRunId: string): Promise<MailSyncRun | undefined>;
  claimSyncRun(
    syncRunId: string,
    expectedRevision: number,
    expectedPhase: MailSyncPhase,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<MailSyncRun | undefined>;
  renewSyncRunLease(
    syncRunId: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<boolean>;
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
  listSubmissions(userId: string): Promise<readonly MailStoredSubmission[]>;
  listAllSubmissions(): Promise<readonly MailStoredSubmission[]>;
  createSubmission(
    submission: MailSubmission,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<MailStoredSubmission>;
  createScheduledSubmission(
    submission: MailSubmission,
    idempotencyKey: string,
    requestFingerprint: string,
    actorId: string,
    input: MailComposeInput,
  ): Promise<MailStoredSubmission>;
  getScheduledSubmission(
    submissionId: string,
  ): Promise<MailScheduledSubmission | undefined>;
  clearScheduledSubmission(submissionId: string): Promise<void>;
  failScheduledSubmission(
    submissionId: string,
    error: MailProviderError,
  ): Promise<void>;
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
  deletePublishedOutboxBefore?(before: string): Promise<number>;
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

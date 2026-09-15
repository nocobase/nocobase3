import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type {
  MailAccountView,
  MailAccount,
  MailAttachmentContent,
  MailAuthorizationStartResult,
  MailConnectAccountInput,
  MailCompleteAuthorizationInput,
  MailListMessagesInput,
  MailListConversationMessagesInput,
  MailManagedAccountView,
  MailManagementMessageActionInput,
  MailManagementMessageActionItemResult,
  MailManagementMessageActionResult,
  MailFolder,
  MailLabel,
  MailLabelColor,
  MailMessage,
  MailMessageSummary,
  MailOperationContext,
  MailPage,
  MailService,
  MailStartAuthorizationInput,
  MailStartSyncInput,
  MailStore,
  MailSignature,
  MailSyncRun,
  MailSyncRunView,
  MailSubmission,
  MailSubmissionLogView,
  MailSubmissionView,
  MailCredentialVault,
  MailIdentity,
  MailDraftConflict,
  MailDraftRemoteVersion,
  MailResolveDraftConflictInput,
  MailProviderConfig,
  MailProviderContext,
  MailProviderRegistry,
  MailProviderView,
  MailOutboundAttachmentStorage,
  MailOutboundAttachmentView,
  MailSaveLabelInput,
  MailUploadAttachmentInput,
  NormalizedMailAttachment,
  NormalizedMailMessage,
} from './types.js';
import {
  DEFAULT_MAIL_LABEL_COLOR,
  isMailLabelColor,
  MAIL_LOCAL_DRAFT_FOLDER_ID,
  MAIL_PROVIDER_ERROR_CATEGORIES,
} from './types.js';
import { SendMailOperation } from './operations/send-mail.js';
import { toMailAccountView } from './store.js';
import {
  DEFAULT_MAIL_AUTOMATIC_SYNC_INTERVAL_MINUTES,
  resolveMailAutomaticSyncIntervalMinutes,
  resolveMailSyncBatchSize,
} from './config.js';
import {
  notifyMailMessageChange,
  type MailMessageChangeNotifier,
} from './realtime.js';
import type {
  MailProviderAdapter,
  MailProviderAdapterResolver,
} from './types.js';

export interface MailOutboxPublisher {
  kick(): void;
}

export interface DefaultMailServiceDependencies {
  readonly store: MailStore;
  readonly adapters: MailProviderAdapterResolver;
  readonly outbox: MailOutboxPublisher;
  readonly syncBatchSize?: number;
  readonly defaultAutomaticSyncIntervalMinutes?: number;
  readonly registry?: MailProviderRegistry;
  readonly providerContext?: MailProviderContext;
  readonly credentials?: MailCredentialVault;
  readonly resolveProviderConfig?: (
    provider: import('./types.js').MailProviderIdentity,
  ) => MailProviderConfig;
  readonly listProviderConfigs?: () => readonly MailProviderConfig[];
  readonly outboundAttachments?: MailOutboundAttachmentStorage;
  readonly messageChangeNotifier?: MailMessageChangeNotifier;
}

export class DefaultMailService implements MailService {
  private readonly sendMail: SendMailOperation;
  private readonly syncBatchSize: number;
  private readonly defaultAutomaticSyncIntervalMinutes: number;

  public constructor(
    private readonly dependencies: DefaultMailServiceDependencies,
  ) {
    this.syncBatchSize = resolveMailSyncBatchSize(dependencies.syncBatchSize);
    this.defaultAutomaticSyncIntervalMinutes =
      resolveMailAutomaticSyncIntervalMinutes(
        dependencies.defaultAutomaticSyncIntervalMinutes ??
          DEFAULT_MAIL_AUTOMATIC_SYNC_INTERVAL_MINUTES,
      );
    this.sendMail = new SendMailOperation({
      ...dependencies,
      outbox: dependencies.outbox,
    });
  }

  public listProviders(): Promise<readonly MailProviderView[]> {
    const registry = this.dependencies.registry;
    const listConfigs = this.dependencies.listProviderConfigs;
    if (!registry || !listConfigs) return Promise.resolve([]);
    return Promise.resolve().then(() => {
      const configuredTypes = new Set<string>();
      const providers = listConfigs().flatMap((config) => {
        configuredTypes.add(config.type);
        const definition = registry.definition(config.type);
        if (!definition || config.enabled === false) return [];
        try {
          return [
            {
              type: definition.type,
              name: config.name,
              label: definition.label,
              capabilities: definition.capabilities,
              ...(definition.connection
                ? { connection: 'credentials' as const }
                : definition.authorization
                  ? { connection: 'oauth' as const }
                  : {}),
              configured: true,
            },
          ];
        } catch {
          return [];
        }
      });
      for (const definition of registry.definitions()) {
        if (configuredTypes.has(definition.type)) continue;
        providers.push({
          type: definition.type,
          name: definition.type,
          label: definition.label,
          capabilities: definition.capabilities,
          ...(definition.connection
            ? { connection: 'credentials' as const }
            : definition.authorization
              ? { connection: 'oauth' as const }
              : {}),
          configured: false,
        });
      }
      return providers;
    });
  }

  public async connectAccount(
    context: MailOperationContext,
    input: MailConnectAccountInput,
  ): Promise<MailAccountView> {
    const { registry, resolveProviderConfig, providerContext } =
      this.authorizationDependencies();
    const definition = registry.definition(input.provider.type);
    if (!definition?.connection) {
      throw new Error('Mail Provider credential connection is not available.');
    }
    const config = resolveProviderConfig(input.provider);
    definition.validateConfig?.(config);
    const result = await definition.connection.connect(
      providerContext,
      config,
      {
        address: input.address,
        displayName: input.displayName,
        username: input.username,
        password: input.password,
        signal: context.signal,
      },
    );
    if (!result.ok) throw new Error(result.error.message);
    return this.persistAuthorizedAccount(
      context.actorId,
      input.provider,
      result.value,
      input.initialSyncReceivedAfter,
    );
  }

  public async startAuthorization(
    context: MailOperationContext,
    input: MailStartAuthorizationInput,
  ): Promise<MailAuthorizationStartResult> {
    const { registry, resolveProviderConfig, credentials, providerContext } =
      this.authorizationDependencies();
    const definition = registry.definition(input.provider.type);
    if (!definition?.authorization) {
      throw new Error('Mail Provider authorization is not available.');
    }
    const config = resolveProviderConfig(input.provider);
    definition.validateConfig?.(config);
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(64).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const verifierCredentialReference = await credentials.put(
      { codeVerifier },
      { purpose: 'authorization', expiresAt },
    );
    try {
      const result = await definition.authorization.start(
        providerContext,
        config,
        {
          redirectUri: input.redirectUri,
          state,
          codeChallenge,
          scopes: input.scopes,
        },
      );
      if (!result.ok) throw new Error(result.error.message);
      await this.dependencies.store.createAuthorizationTransaction({
        stateHash: hashState(state),
        userId: context.actorId,
        provider: input.provider,
        redirectUri: input.redirectUri,
        verifierCredentialReference,
        scopes: input.scopes ?? [],
        initialSyncReceivedAfter: input.initialSyncReceivedAfter,
        expiresAt,
      });
      return { ...result.value, state, expiresAt };
    } catch (error) {
      await credentials.delete(verifierCredentialReference);
      throw error;
    }
  }

  public async completeAuthorization(
    input: MailCompleteAuthorizationInput,
  ): Promise<MailAccountView> {
    const { registry, resolveProviderConfig, credentials, providerContext } =
      this.authorizationDependencies();
    const transaction =
      await this.dependencies.store.consumeAuthorizationTransaction(
        hashState(input.state),
        new Date().toISOString(),
      );
    if (!transaction) {
      throw new Error('Mail authorization state is invalid or expired.');
    }
    try {
      if (input.error || !input.code) {
        throw new Error('Mail authorization was denied by the Provider.');
      }
      const definition = registry.definition(transaction.provider.type);
      if (!definition?.authorization) {
        throw new Error('Mail Provider authorization is not available.');
      }
      const config = resolveProviderConfig(transaction.provider);
      const verifier = await credentials.get<{
        readonly codeVerifier: string;
      }>(transaction.verifierCredentialReference);
      const result = await definition.authorization.complete(
        providerContext,
        config,
        {
          redirectUri: transaction.redirectUri,
          state: input.state,
          code: input.code,
          codeVerifier: verifier.codeVerifier,
          scopes: transaction.scopes,
        },
      );
      if (!result.ok) throw new Error(result.error.message);
      return this.persistAuthorizedAccount(
        transaction.userId,
        transaction.provider,
        result.value,
        transaction.initialSyncReceivedAfter,
      );
    } finally {
      await credentials.delete(transaction.verifierCredentialReference);
    }
  }

  public async listAccounts(
    context: MailOperationContext,
  ): Promise<readonly MailAccountView[]> {
    return (await this.dependencies.store.listAccounts(context.actorId)).map(
      toMailAccountView,
    );
  }

  public async updateAccount(
    context: MailOperationContext,
    input: import('./types.js').MailUpdateAccountInput,
  ): Promise<MailAccountView> {
    const account = await this.dependencies.store.getAccount(input.accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }

    let updated = account;
    if (input.status) {
      if (
        input.status === 'active' &&
        !['active', 'suspended'].includes(updated.status)
      ) {
        throw new Error('This Mail account must be reauthorized.');
      }
    }
    const automaticSyncIntervalMinutes =
      input.automaticSyncIntervalMinutes === undefined
        ? (updated.automaticSyncIntervalMinutes ??
          this.defaultAutomaticSyncIntervalMinutes)
        : resolveMailAutomaticSyncIntervalMinutes(
            input.automaticSyncIntervalMinutes,
          );
    if (
      input.status !== undefined ||
      input.automaticSyncIntervalMinutes !== undefined
    ) {
      updated = await this.dependencies.store.saveAccount({
        ...updated,
        status: input.status ?? updated.status,
        automaticSyncIntervalMinutes,
      });
    }
    return toMailAccountView(updated);
  }

  public async removeAccount(
    context: MailOperationContext,
    accountId: string,
  ): Promise<void> {
    const account = await this.dependencies.store.getAccount(accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    if (
      !(await this.dependencies.store.markAccountRemoving(
        account.id,
        context.actorId,
      ))
    ) {
      throw new Error('Mail account was not found.');
    }
    const activeSyncRun =
      await this.dependencies.store.findActiveSyncRun(accountId);
    if (activeSyncRun) {
      // Removing the account also cancels its queued or running local sync.
      // Marking the account first prevents another sync from being scheduled
      // while the account's records are being deleted.
      await this.dependencies.store.cancelSyncRun(activeSyncRun.id);
    }
    const pushSubscription =
      await this.dependencies.store.getPushSubscription(accountId);
    let pushAdapter: MailProviderAdapter | undefined;
    if (pushSubscription) {
      try {
        pushAdapter = await this.dependencies.adapters.resolve(account);
      } catch {
        // Local disconnect remains authoritative if Provider cleanup fails.
      }
    }
    if (!(await this.dependencies.store.deleteAccount(accountId))) {
      if (pushAdapter) await closeAdapter(pushAdapter);
      throw new Error('Mail account was not found.');
    }
    notifyMailMessageChange(
      this.dependencies.messageChangeNotifier,
      context.actorId,
    );
    try {
      if (pushAdapter && pushSubscription) {
        await pushAdapter.deletePushSubscription?.(
          pushSubscription.providerSubscriptionId,
          context.signal,
        );
      }
    } catch {
      // Local disconnect remains authoritative if Provider cleanup fails.
    } finally {
      if (pushAdapter) await closeAdapter(pushAdapter);
    }
    try {
      await this.dependencies.credentials?.delete(account.credentialReference);
    } catch {
      // Credential cleanup must not make a completed account removal ambiguous.
    }
  }

  public async listManagedAccounts(
    context: MailOperationContext,
  ): Promise<readonly MailManagedAccountView[]> {
    return (await this.dependencies.store.listAllAccounts()).map((account) => ({
      ...toMailAccountView(account),
      canSync: account.userId === context.actorId,
    }));
  }

  public async listManagedOperationLogs(
    context: MailOperationContext,
  ): Promise<import('./types.js').MailManagedOperationLogsView> {
    const [accounts, syncRuns, submissions] = await Promise.all([
      this.dependencies.store.listAllAccounts(),
      this.dependencies.store.listAllSyncRuns(),
      this.dependencies.store.listAllSubmissions(),
    ]);
    return {
      accounts: accounts.map(toMailAccountView),
      syncRuns: syncRuns.map((run) => ({
        ...toSyncRunView(run),
        canManage:
          accounts.find((account) => account.id === run.accountId)?.userId ===
          context.actorId,
      })),
      submissions: submissions.map(toSubmissionLogView),
    };
  }

  public listManagedFolders(
    _context: MailOperationContext,
    accountId: string,
  ): Promise<readonly MailFolder[]> {
    return this.dependencies.store.listFolders(accountId);
  }

  public listManagedMessages(
    _context: MailOperationContext,
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>> {
    return this.dependencies.store.listAllMessages(input);
  }

  public async manageMessages(
    context: MailOperationContext,
    input: MailManagementMessageActionInput,
  ): Promise<MailManagementMessageActionResult> {
    const items: MailManagementMessageActionItemResult[] = [];
    for (const target of input.items) {
      try {
        await this.executeManagedMessageAction(context, target, input);
        items.push({ ...target, status: 'succeeded' });
      } catch (cause) {
        items.push({
          ...target,
          status: 'failed',
          error: toManagementActionError(cause),
        });
      }
    }
    return {
      items,
      succeeded: items.filter((item) => item.status === 'succeeded').length,
      failed: items.filter((item) => item.status === 'failed').length,
    };
  }

  public async listFolders(
    context: MailOperationContext,
    accountId: string,
  ): Promise<readonly MailFolder[]> {
    await this.requireOwnedAccount(context, accountId);
    return this.dependencies.store.listFolders(accountId);
  }

  public listLabels(
    context: MailOperationContext,
  ): Promise<readonly MailLabel[]> {
    return this.dependencies.store.listLabels(context.actorId);
  }

  public async listIdentities(
    context: MailOperationContext,
    accountId: string,
  ): Promise<readonly import('./types.js').MailIdentity[]> {
    await this.requireOwnedAccount(context, accountId);
    return this.dependencies.store.listIdentities(accountId);
  }

  public async updateIdentity(
    context: MailOperationContext,
    input: import('./types.js').MailUpdateIdentityInput,
  ): Promise<import('./types.js').MailIdentity> {
    const account = await this.dependencies.store.getAccount(input.accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    const identity = await this.dependencies.store.getIdentity(
      input.identityId,
    );
    if (!identity || identity.accountId !== account.id) {
      throw new Error('Mail sending identity was not found.');
    }
    const updated = await this.dependencies.store.updateIdentity(identity.id, {
      displayName:
        input.displayName === undefined
          ? identity.displayName
          : (input.displayName ?? undefined),
    });
    if (!updated) throw new Error('Mail sending identity was not found.');
    return updated;
  }

  public async listSignatures(
    context: MailOperationContext,
    accountId: string,
  ): Promise<readonly MailSignature[]> {
    await this.requireOwnedAccount(context, accountId);
    return this.dependencies.store.listSignatures(accountId);
  }

  public async saveSignature(
    context: MailOperationContext,
    input: import('./types.js').MailSaveSignatureInput,
  ): Promise<MailSignature> {
    await this.requireOwnedAccount(context, input.accountId);
    const name = input.name.trim();
    if (!name) throw new TypeError('Mail signature name is required.');
    const existing = input.id
      ? await this.dependencies.store.getSignature(input.id)
      : undefined;
    if (input.id && (!existing || existing.accountId !== input.accountId)) {
      throw new Error('Mail signature was not found.');
    }
    const current = await this.dependencies.store.listSignatures(
      input.accountId,
    );
    const now = new Date().toISOString();
    return this.dependencies.store.saveSignature({
      id: input.id ?? randomUUID(),
      accountId: input.accountId,
      name,
      text: input.text,
      html: input.html ?? undefined,
      isDefault: input.isDefault ?? current.length === 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  public async deleteSignature(
    context: MailOperationContext,
    accountId: string,
    signatureId: string,
  ): Promise<void> {
    await this.requireOwnedAccount(context, accountId);
    const signature = await this.dependencies.store.getSignature(signatureId);
    if (
      !signature ||
      signature.accountId !== accountId ||
      !(await this.dependencies.store.deleteSignature(accountId, signatureId))
    ) {
      throw new Error('Mail signature was not found.');
    }
    if (signature.isDefault) {
      const replacement = (
        await this.dependencies.store.listSignatures(accountId)
      )[0];
      if (replacement) {
        await this.dependencies.store.saveSignature({
          ...replacement,
          isDefault: true,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  public async createLabel(
    context: MailOperationContext,
    input: MailSaveLabelInput,
  ): Promise<MailLabel> {
    const labelName = input.name.trim();
    if (!labelName) throw new TypeError('Mail label name is required.');
    const labels = await this.dependencies.store.listLabels(context.actorId);
    if (labels.some((label) => label.name === labelName)) {
      throw new TypeError('Mail label name is already in use.');
    }
    return this.dependencies.store.createLabel(
      context.actorId,
      labelName,
      normalizeMailLabelColor(input.color),
    );
  }

  public async updateLabel(
    context: MailOperationContext,
    input: MailSaveLabelInput & { readonly id: string },
  ): Promise<MailLabel> {
    const labelName = input.name.trim();
    if (!labelName) throw new TypeError('Mail label name is required.');
    const labels = await this.dependencies.store.listLabels(context.actorId);
    const existing = labels.find((label) => label.id === input.id);
    if (!existing) throw new Error('Mail label was not found.');
    if (
      labels.some((label) => label.id !== input.id && label.name === labelName)
    ) {
      throw new TypeError('Mail label name is already in use.');
    }
    const updated = await this.dependencies.store.updateLabel(
      context.actorId,
      input.id,
      {
        name: labelName,
        color: normalizeMailLabelColor(input.color, existing.color),
      },
    );
    if (!updated) throw new Error('Mail label was not found.');
    return updated;
  }

  public async deleteLabel(
    context: MailOperationContext,
    labelId: string,
  ): Promise<void> {
    if (
      !(await this.dependencies.store.deleteLabel(context.actorId, labelId))
    ) {
      throw new Error('Mail label was not found.');
    }
  }

  public async updateMessageLabels(
    context: MailOperationContext,
    input: import('./types.js').MailUpdateMessageLabelsInput,
  ): Promise<MailMessage> {
    const { message } = await this.requireOwnedMessage(
      context,
      input.accountId,
      input.messageId,
    );
    const add = [...new Set(input.addLabelIds ?? [])];
    const remove = [...new Set(input.removeLabelIds ?? [])].filter(
      (id) => !add.includes(id),
    );
    const labels = new Set(
      (await this.dependencies.store.listLabels(context.actorId)).map(
        (label) => label.id,
      ),
    );
    if ([...add, ...remove].some((id) => !labels.has(id))) {
      throw new TypeError('Mail label was not found.');
    }
    if (add.length === 0 && remove.length === 0) return message;
    const updated = await this.dependencies.store.updateMessageLabels(
      input.accountId,
      message.id,
      add,
      remove,
    );
    if (!updated) throw new Error('Mail message was not found after update.');
    notifyMailMessageChange(
      this.dependencies.messageChangeNotifier,
      context.actorId,
    );
    return updated;
  }

  public getUnreadCount(context: MailOperationContext): Promise<number> {
    return this.dependencies.store.countUnreadMessages(context.actorId);
  }

  public async startSync(
    context: MailOperationContext,
    input: MailStartSyncInput,
  ): Promise<MailSyncRunView> {
    const account = await this.requireActiveAccount(context, input.accountId);
    const active = await this.dependencies.store.findActiveSyncRun(
      input.accountId,
    );
    if (active) return toSyncRunView(active);
    const cursor = await this.dependencies.store.getSyncCursor(input.accountId);
    const mode = input.mode ?? (cursor ? 'incremental' : 'initial');
    if (mode === 'incremental' && !cursor) {
      throw new Error(
        'Initial mailbox sync must complete before incremental sync.',
      );
    }
    const run = await this.dependencies.store.createSyncRun({
      id: randomUUID(),
      accountId: input.accountId,
      requestedBy: context.actorId,
      mode,
      policy: {
        receivedAfter:
          input.receivedAfter ??
          (mode === 'initial' ? account.initialSyncReceivedAfter : undefined),
        maxMessages: boundedInteger(input.maxMessages, 10_000, 1, 100_000),
        batchSize: this.syncBatchSize,
      },
    });
    this.dependencies.outbox.kick();
    return toSyncRunView(run);
  }

  public async getSyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRunView | undefined> {
    const run = await this.dependencies.store.getSyncRun(syncRunId);
    if (!run) return undefined;
    const account = await this.dependencies.store.getAccount(run.accountId);
    return account?.userId === context.actorId ? toSyncRunView(run) : undefined;
  }

  public async listSyncRuns(
    context: MailOperationContext,
  ): Promise<readonly MailSyncRunView[]> {
    return (await this.dependencies.store.listSyncRuns(context.actorId)).map(
      toSyncRunView,
    );
  }

  public async retrySyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRunView> {
    const run = await this.requireOwnedSyncRun(context, syncRunId);
    if (!['failed', 'cancelled'].includes(run.status)) {
      throw new Error('Only failed or cancelled sync runs can be retried.');
    }
    return this.startSync(context, {
      accountId: run.accountId,
      mode: run.mode,
      receivedAfter: run.policy.receivedAfter,
      maxMessages: run.policy.maxMessages,
    });
  }

  public async cancelSyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRunView> {
    const run = await this.requireOwnedSyncRun(context, syncRunId);
    if (!['pending', 'running'].includes(run.status)) {
      throw new Error('Only active sync runs can be cancelled.');
    }
    const cancelled = await this.dependencies.store.cancelSyncRun(syncRunId);
    if (!cancelled) throw new Error('Mail sync run is no longer active.');
    return toSyncRunView(cancelled);
  }

  public async listSubmissions(
    context: MailOperationContext,
  ): Promise<readonly MailSubmissionLogView[]> {
    return (await this.dependencies.store.listSubmissions(context.actorId)).map(
      toSubmissionLogView,
    );
  }

  public listMessages(
    context: MailOperationContext,
    input: MailListMessagesInput,
  ): Promise<MailPage<MailMessageSummary>> {
    return this.dependencies.store.listMessages(context.actorId, input);
  }

  public getMessage(
    context: MailOperationContext,
    accountId: string,
    messageId: string,
  ): Promise<MailMessage | undefined> {
    return this.dependencies.store.getMessage(
      context.actorId,
      accountId,
      messageId,
    );
  }

  public async listConversationMessages(
    context: MailOperationContext,
    accountId: string,
    conversationId: string,
    input: MailListConversationMessagesInput = {},
  ): Promise<MailPage<MailMessage>> {
    await this.requireOwnedAccount(context, accountId);
    return this.dependencies.store.listConversationMessages(
      context.actorId,
      accountId,
      conversationId,
      input,
    );
  }

  public async sendMessage(
    context: MailOperationContext,
    input: import('./types.js').MailComposeInput,
  ): Promise<MailSubmissionView> {
    return toSubmissionView(await this.sendMail.execute(context, input));
  }

  public async sendBulk(
    context: MailOperationContext,
    input: import('./types.js').MailBulkComposeInput,
  ): Promise<readonly MailSubmissionView[]> {
    if (input.recipients.length === 0 || input.recipients.length > 100) {
      throw new TypeError('Bulk mail requires between 1 and 100 recipients.');
    }
    const submissions: MailSubmissionView[] = [];
    const bulkKeyPrefix = `bulk:${createHash('sha256').update(input.idempotencyKey).digest('hex')}`;
    for (const [index, recipient] of input.recipients.entries()) {
      const idempotencyKey = `${bulkKeyPrefix}:${index}`;
      const existing =
        await this.dependencies.store.getSubmissionByIdempotencyKey(
          input.accountId,
          idempotencyKey,
        );
      submissions.push(
        toSubmissionView(
          await this.sendMail.execute(context, {
            ...input,
            to: [recipient],
            cc: [],
            bcc: [],
            scheduledAt:
              input.scheduledAt ??
              existing?.scheduledAt ??
              new Date(Date.now() + 1_000).toISOString(),
            idempotencyKey,
          }),
        ),
      );
    }
    return submissions;
  }

  public async saveDraft(
    context: MailOperationContext,
    input: import('./types.js').MailComposeInput,
  ): Promise<MailMessage> {
    if (input.scheduledAt) {
      throw new TypeError('A draft cannot also be scheduled for delivery.');
    }
    const account = await this.dependencies.store.getAccount(input.accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    if (account.status !== 'active') {
      throw new Error('Mail account is not active.');
    }
    const identity = await this.dependencies.store.getIdentity(
      input.identityId,
    );
    if (!identity || identity.accountId !== account.id || !identity.canSend) {
      throw new Error('Mail sending identity is not available.');
    }
    const existingDraft = input.draftMessageId
      ? await this.dependencies.store.getMessage(
          context.actorId,
          account.id,
          input.draftMessageId,
        )
      : undefined;
    if (input.draftMessageId && (!existingDraft || !existingDraft.draft)) {
      throw new Error('Mail draft was not found.');
    }
    let localDraft = await this.dependencies.store.saveMessage(
      account.id,
      await this.createLocalDraftMessage(
        context,
        identity,
        input,
        existingDraft,
      ),
    );
    let adapter: MailProviderAdapter | undefined;
    try {
      adapter = await this.dependencies.adapters.resolve(
        account,
        context.signal,
      );
    } catch {
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
      );
      return localDraft;
    }
    try {
      if (!adapter.capabilities.drafts || !adapter.saveDraft) return localDraft;
      const remoteDraftId =
        existingDraft?.providerDraftMessageId ??
        (existingDraft && !isLocalDraftMessage(existingDraft)
          ? existingDraft.providerMessageId
          : undefined);
      if (remoteDraftId && adapter.getMessage) {
        const remote = await adapter.getMessage(remoteDraftId, context.signal);
        if (remote.ok && !sameDraftContent(existingDraft, remote.value)) {
          localDraft = await this.dependencies.store.saveMessage(account.id, {
            ...normalizedDraftFromMessage(localDraft),
            draftConflict: toDraftConflict(remote.value),
          });
          notifyMailMessageChange(
            this.dependencies.messageChangeNotifier,
            context.actorId,
          );
          return localDraft;
        }
      }
      const providerMessage = await this.sendMail.prepareProviderMessage(
        context,
        input,
      );
      const hasRemoteDraft = Boolean(
        existingDraft?.providerDraftId ||
        existingDraft?.providerDraftMessageId ||
        (existingDraft && !isLocalDraftMessage(existingDraft)),
      );
      const draft = assertProviderResult(
        hasRemoteDraft && existingDraft
          ? await (adapter.updateDraft
              ? adapter.updateDraft(
                  existingDraft.providerDraftId ??
                    existingDraft.providerDraftMessageId ??
                    existingDraft.providerMessageId,
                  {
                    trackingId: randomUUID(),
                    identity,
                    message: providerMessage,
                    signal: context.signal,
                  },
                )
              : Promise.resolve({
                  ok: false as const,
                  error: {
                    code: 'MAIL_DRAFT_UPDATE_UNSUPPORTED',
                    message: 'The selected Mail Provider cannot update drafts.',
                    category: 'configuration' as const,
                    retryable: false,
                  },
                }))
          : await adapter.saveDraft({
              trackingId: randomUUID(),
              identity,
              message: providerMessage,
              signal: context.signal,
            }),
      );
      const saved = await this.dependencies.store.saveMessage(account.id, {
        ...normalizedDraftFromMessage(localDraft),
        providerDraftMessageId: draft.providerMessageId,
        providerDraftId: draft.providerDraftId,
        draft: true,
      });
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
      );
      return saved;
    } catch {
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
      );
      return localDraft;
    } finally {
      if (adapter) await closeAdapter(adapter);
    }
  }

  public async resolveDraftConflict(
    context: MailOperationContext,
    input: MailResolveDraftConflictInput,
  ): Promise<MailMessage> {
    const { account, message } = await this.requireOwnedMessage(
      context,
      input.accountId,
      input.messageId,
    );
    if (!message.draft || !message.draftConflict) {
      throw new Error('Mail draft conflict was not found.');
    }
    const remote = message.draftConflict.remote;
    const normalized: NormalizedMailMessage =
      input.action === 'useRemote'
        ? {
            providerMessageId: message.providerMessageId,
            providerDraftMessageId: message.providerDraftMessageId,
            providerDraftId: message.providerDraftId,
            providerConversationId:
              remote.providerConversationId ?? message.conversationId,
            providerFolderIds: [MAIL_LOCAL_DRAFT_FOLDER_ID],
            from: remote.from,
            to: remote.to,
            cc: remote.cc,
            bcc: remote.bcc,
            replyTo: message.replyTo,
            inReplyTo: message.inReplyTo,
            references: message.references,
            subject: remote.subject,
            preview: (remote.text ?? '').slice(0, 240),
            text: remote.text,
            html: remote.html,
            read: true,
            starred: message.starred,
            draft: true,
            attachments: remote.attachments,
          }
        : normalizedDraftFromMessage(message);
    const resolved = await this.dependencies.store.saveMessage(
      account.id,
      normalized,
    );
    notifyMailMessageChange(
      this.dependencies.messageChangeNotifier,
      context.actorId,
    );
    return resolved;
  }

  private async createLocalDraftMessage(
    context: MailOperationContext,
    identity: MailIdentity,
    input: import('./types.js').MailComposeInput,
    existingDraft?: MailMessage,
  ): Promise<NormalizedMailMessage> {
    const attachments = await this.loadLocalDraftAttachments(
      context,
      input,
      existingDraft,
    );
    return {
      providerMessageId:
        existingDraft?.providerMessageId ?? `local-draft:${randomUUID()}`,
      providerDraftMessageId: existingDraft?.providerDraftMessageId,
      providerDraftId: existingDraft?.providerDraftId,
      providerConversationId: existingDraft?.conversationId,
      providerFolderIds: [MAIL_LOCAL_DRAFT_FOLDER_ID],
      from: {
        address: identity.address,
        ...(identity.displayName ? { name: identity.displayName } : {}),
      },
      to: input.to,
      cc: input.cc ?? [],
      bcc: input.bcc ?? [],
      replyTo: [],
      references: existingDraft?.references ?? [],
      inReplyTo: existingDraft?.inReplyTo,
      subject: input.subject,
      preview: input.text.slice(0, 240),
      text: input.text,
      html: input.html,
      read: true,
      starred: existingDraft?.starred ?? false,
      draft: true,
      attachments,
      draftConflict: existingDraft?.draftConflict,
    };
  }

  private async loadLocalDraftAttachments(
    context: MailOperationContext,
    input: import('./types.js').MailComposeInput,
    existingDraft?: MailMessage,
  ): Promise<readonly NormalizedMailAttachment[]> {
    const retained =
      input.retainedAttachmentIds === undefined
        ? (existingDraft?.attachments ?? [])
        : (existingDraft?.attachments ?? []).filter((attachment) =>
            input.retainedAttachmentIds?.includes(attachment.id),
          );
    const attachments: NormalizedMailAttachment[] = retained.map(
      (attachment) => ({
        providerAttachmentId: attachment.providerAttachmentId,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
        contentId: attachment.contentId,
        inline: attachment.inline,
      }),
    );
    for (const attachmentId of input.attachmentIds ?? []) {
      const metadata = await this.dependencies.store.getOutboundAttachment(
        context.actorId,
        attachmentId,
      );
      if (!metadata) throw new Error('Mail outbound attachment was not found.');
      if (
        attachments.some(
          (attachment) => attachment.providerAttachmentId === attachmentId,
        )
      )
        continue;
      attachments.push({
        providerAttachmentId: attachmentId,
        fileName: metadata.fileName,
        contentType: metadata.contentType,
        size: metadata.size,
        inline: false,
      });
    }
    return attachments;
  }

  public async uploadAttachment(
    context: MailOperationContext,
    input: MailUploadAttachmentInput,
  ): Promise<MailOutboundAttachmentView> {
    const storage = this.dependencies.outboundAttachments;
    if (!storage) throw new Error('Mail attachment storage is not configured.');
    return storage.create(context.actorId, input);
  }

  public listTemplates(
    context: MailOperationContext,
  ): Promise<readonly import('./types.js').MailTemplate[]> {
    return this.dependencies.store.listTemplates(context.actorId);
  }

  public async saveTemplate(
    context: MailOperationContext,
    input: import('./types.js').MailSaveTemplateInput,
  ): Promise<import('./types.js').MailTemplate> {
    const name = input.name.trim();
    if (!name) throw new TypeError('Mail template name is required.');
    if (input.id) {
      const owned = await this.dependencies.store.listTemplates(
        context.actorId,
      );
      if (!owned.some((template) => template.id === input.id)) {
        throw new Error('Mail template was not found.');
      }
    }
    return this.dependencies.store.saveTemplate({
      id: input.id ?? randomUUID(),
      name,
      subject: input.subject,
      text: input.text,
      html: input.html ?? '',
      ownerId: context.actorId,
    });
  }

  public async deleteTemplate(
    context: MailOperationContext,
    templateId: string,
  ): Promise<void> {
    if (
      !(await this.dependencies.store.deleteTemplate(
        context.actorId,
        templateId,
      ))
    ) {
      throw new Error('Mail template was not found.');
    }
  }

  public async updateMessage(
    context: MailOperationContext,
    input: import('./types.js').MailUpdateMessageInput,
  ): Promise<MailMessage> {
    const { account, message } = await this.requireOwnedMessage(
      context,
      input.accountId,
      input.messageId,
    );
    if (
      input.read === undefined &&
      input.starred === undefined &&
      input.note === undefined &&
      input.todo === undefined
    )
      return message;
    if (input.read === undefined && input.starred === undefined) {
      const updated = await this.dependencies.store.updateMessageState(
        account.id,
        message.id,
        { note: input.note, todo: input.todo },
      );
      if (!updated) throw new Error('Mail message was not found after update.');
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
      );
      return updated;
    }
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (input.read !== undefined) {
        if (!adapter.setRead)
          throw new Error(
            'The selected Mail Provider cannot change read state.',
          );
        assertProviderResult(
          await adapter.setRead(
            message.providerMessageId,
            input.read,
            context.signal,
          ),
        );
      }
      if (input.starred !== undefined) {
        if (!adapter.setStarred)
          throw new Error(
            'The selected Mail Provider cannot change starred state.',
          );
        assertProviderResult(
          await adapter.setStarred(
            message.providerMessageId,
            input.starred,
            context.signal,
          ),
        );
      }
      const updated = await this.dependencies.store.updateMessageState(
        account.id,
        message.id,
        {
          read: input.read,
          starred: input.starred,
          note: input.note,
          todo: input.todo,
        },
      );
      if (!updated) throw new Error('Mail message was not found after update.');
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
      );
      return updated;
    } finally {
      await closeAdapter(adapter);
    }
  }

  private async requireOwnedSyncRun(
    context: MailOperationContext,
    syncRunId: string,
  ): Promise<MailSyncRun> {
    const run = await this.dependencies.store.getSyncRun(syncRunId);
    if (!run) throw new Error('Mail sync run was not found.');
    await this.requireOwnedAccount(context, run.accountId);
    return run;
  }

  public async moveMessage(
    context: MailOperationContext,
    input: import('./types.js').MailMoveMessageInput,
  ): Promise<MailMessage> {
    const { account, message } = await this.requireOwnedMessage(
      context,
      input.accountId,
      input.messageId,
    );
    const folder = (await this.dependencies.store.listFolders(account.id)).find(
      (item) => item.providerFolderId === input.providerFolderId,
    );
    if (!folder) throw new Error('Mail destination folder was not found.');
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (!adapter.capabilities.moveMessage || !adapter.moveMessage) {
        throw new Error('The selected Mail Provider cannot move messages.');
      }
      const moved = assertProviderResult(
        await adapter.moveMessage(
          message.providerMessageId,
          input.providerFolderId,
          context.signal,
        ),
      );
      const updated = await this.dependencies.store.moveMessage(
        account.id,
        message.id,
        moved.providerMessageId,
        input.providerFolderId,
      );
      if (!updated) throw new Error('Mail message was not found after move.');
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        context.actorId,
      );
      return updated;
    } finally {
      await closeAdapter(adapter);
    }
  }

  public async deleteMessage(
    context: MailOperationContext,
    input: import('./types.js').MailDeleteMessageInput,
  ): Promise<void> {
    const { account, message } = await this.requireOwnedMessage(
      context,
      input.accountId,
      input.messageId,
    );
    if (isLocalDraftMessage(message)) {
      let adapter: MailProviderAdapter | undefined;
      try {
        if (message.providerDraftMessageId) {
          adapter = await this.dependencies.adapters.resolve(
            account,
            context.signal,
          );
          if (adapter.deleteMessage) {
            await adapter.deleteMessage(
              message.providerDraftMessageId,
              true,
              context.signal,
            );
          }
        }
      } catch {
        // Remote draft cleanup is best effort; local deletion remains authoritative.
      } finally {
        if (adapter) await closeAdapter(adapter);
      }
      const deleted = await this.dependencies.store.deleteMessage(
        account.id,
        message.id,
      );
      if (deleted) {
        notifyMailMessageChange(
          this.dependencies.messageChangeNotifier,
          context.actorId,
        );
      }
      return;
    }
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (!input.permanently && adapter.moveMessage) {
        const trash = (
          await this.dependencies.store.listFolders(account.id)
        ).find((folder) => folder.type === 'trash');
        if (trash) {
          const moved = assertProviderResult(
            await adapter.moveMessage(
              message.providerMessageId,
              trash.providerFolderId,
              context.signal,
            ),
          );
          const updated = await this.dependencies.store.moveMessage(
            account.id,
            message.id,
            moved.providerMessageId,
            trash.providerFolderId,
          );
          if (!updated)
            throw new Error('Mail message was not found after delete.');
          notifyMailMessageChange(
            this.dependencies.messageChangeNotifier,
            context.actorId,
          );
          return;
        }
      }
      if (!adapter.deleteMessage) {
        throw new Error('The selected Mail Provider cannot delete messages.');
      }
      assertProviderResult(
        await adapter.deleteMessage(
          message.providerMessageId,
          input.permanently ?? false,
          context.signal,
        ),
      );
      const deleted = await this.dependencies.store.deleteMessage(
        account.id,
        message.id,
      );
      if (deleted) {
        notifyMailMessageChange(
          this.dependencies.messageChangeNotifier,
          context.actorId,
        );
      }
    } finally {
      await closeAdapter(adapter);
    }
  }

  public async getAttachment(
    context: MailOperationContext,
    accountId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<MailAttachmentContent> {
    const account = await this.dependencies.store.getAccount(accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    const message = await this.dependencies.store.getMessage(
      context.actorId,
      accountId,
      messageId,
    );
    if (!message) throw new Error('Mail message was not found.');
    const attachment = message.attachments.find(
      (item) =>
        item.id === attachmentId || item.providerAttachmentId === attachmentId,
    );
    if (!attachment) throw new Error('Mail attachment was not found.');
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (!adapter.getAttachment) {
        throw new Error(
          'The selected Mail Provider cannot download attachments.',
        );
      }
      const content = assertProviderResult(
        await adapter.getAttachment(
          message.providerMessageId,
          attachment.providerAttachmentId,
          context.signal,
        ),
      );
      return {
        ...content,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size || content.size,
        stream: finalizeStream(content.stream, () => closeAdapter(adapter)),
      };
    } catch (error) {
      await closeAdapter(adapter);
      throw error;
    }
  }

  private async requireOwnedMessage(
    context: MailOperationContext,
    accountId: string,
    messageId: string,
  ): Promise<{ readonly account: MailAccount; readonly message: MailMessage }> {
    const account = await this.dependencies.store.getAccount(accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    if (account.status !== 'active') {
      throw new Error('Mail account is not active.');
    }
    const message = await this.dependencies.store.getMessage(
      context.actorId,
      accountId,
      messageId,
    );
    if (!message) throw new Error('Mail message was not found.');
    return { account, message };
  }

  private async executeManagedMessageAction(
    context: MailOperationContext,
    target: MailManagementMessageActionInput['items'][number],
    input: MailManagementMessageActionInput,
  ): Promise<void> {
    const account = await this.dependencies.store.getAccount(target.accountId);
    if (!account) throw new Error('Mail account was not found.');
    if (account.status !== 'active') {
      throw new Error('Mail account is not active.');
    }
    const message = await this.dependencies.store.getMessageForAccount(
      account.id,
      target.messageId,
    );
    if (!message) throw new Error('Mail message was not found.');
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      switch (input.action) {
        case 'markRead':
        case 'markUnread': {
          if (!adapter.setRead) {
            throw new Error(
              'The selected Mail Provider cannot change read state.',
            );
          }
          assertManagedProviderResult(
            await adapter.setRead(
              message.providerMessageId,
              input.action === 'markRead',
              context.signal,
            ),
          );
          const updated = await this.dependencies.store.updateMessageState(
            account.id,
            message.id,
            { read: input.action === 'markRead' },
          );
          if (!updated)
            throw new Error('Mail message was not found after update.');
          break;
        }
        case 'star':
        case 'unstar': {
          if (!adapter.setStarred) {
            throw new Error(
              'The selected Mail Provider cannot change starred state.',
            );
          }
          assertManagedProviderResult(
            await adapter.setStarred(
              message.providerMessageId,
              input.action === 'star',
              context.signal,
            ),
          );
          const updated = await this.dependencies.store.updateMessageState(
            account.id,
            message.id,
            { starred: input.action === 'star' },
          );
          if (!updated)
            throw new Error('Mail message was not found after update.');
          break;
        }
        case 'archive':
        case 'move': {
          const destination =
            input.action === 'archive'
              ? (await this.dependencies.store.listFolders(account.id)).find(
                  (folder) => folder.type === 'archive',
                )
              : input.providerFolderId
                ? (await this.dependencies.store.listFolders(account.id)).find(
                    (folder) =>
                      folder.providerFolderId === input.providerFolderId,
                  )
                : undefined;
          if (!destination) {
            throw new Error('Mail destination folder was not found.');
          }
          if (!adapter.capabilities.moveMessage || !adapter.moveMessage) {
            throw new Error('The selected Mail Provider cannot move messages.');
          }
          const moved = assertManagedProviderResult(
            await adapter.moveMessage(
              message.providerMessageId,
              destination.providerFolderId,
              context.signal,
            ),
          );
          const updated = await this.dependencies.store.moveMessage(
            account.id,
            message.id,
            moved.providerMessageId,
            destination.providerFolderId,
          );
          if (!updated)
            throw new Error('Mail message was not found after move.');
          break;
        }
        case 'delete': {
          if (
            !input.permanently &&
            adapter.capabilities.moveMessage &&
            adapter.moveMessage
          ) {
            const trash = (
              await this.dependencies.store.listFolders(account.id)
            ).find((folder) => folder.type === 'trash');
            if (trash) {
              const moved = assertManagedProviderResult(
                await adapter.moveMessage(
                  message.providerMessageId,
                  trash.providerFolderId,
                  context.signal,
                ),
              );
              const updated = await this.dependencies.store.moveMessage(
                account.id,
                message.id,
                moved.providerMessageId,
                trash.providerFolderId,
              );
              if (!updated)
                throw new Error('Mail message was not found after delete.');
              break;
            }
          }
          if (!adapter.deleteMessage) {
            throw new Error(
              'The selected Mail Provider cannot delete messages.',
            );
          }
          assertManagedProviderResult(
            await adapter.deleteMessage(
              message.providerMessageId,
              input.permanently ?? false,
              context.signal,
            ),
          );
          const deleted = await this.dependencies.store.deleteMessage(
            account.id,
            message.id,
          );
          if (!deleted)
            throw new Error('Mail message was not found after delete.');
          break;
        }
      }
      notifyMailMessageChange(
        this.dependencies.messageChangeNotifier,
        account.userId,
      );
    } finally {
      await closeAdapter(adapter);
    }
  }

  private async requireOwnedAccount(
    context: MailOperationContext,
    accountId: string,
  ): Promise<void> {
    const account = await this.dependencies.store.getAccount(accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
  }

  private authorizationDependencies(): {
    readonly registry: MailProviderRegistry;
    readonly providerContext: MailProviderContext;
    readonly credentials: MailCredentialVault;
    readonly resolveProviderConfig: (
      provider: import('./types.js').MailProviderIdentity,
    ) => MailProviderConfig;
  } {
    const { registry, providerContext, credentials, resolveProviderConfig } =
      this.dependencies;
    if (
      !registry ||
      !providerContext ||
      !credentials ||
      !resolveProviderConfig
    ) {
      throw new Error('Mail authorization runtime is not configured.');
    }
    return { registry, providerContext, credentials, resolveProviderConfig };
  }

  private async persistAuthorizedAccount(
    userId: string,
    provider: import('./types.js').MailProviderIdentity,
    authorized: import('./types.js').MailAuthorizedAccount,
    initialSyncReceivedAfter?: string | null,
  ): Promise<MailAccountView> {
    const { credentials } = this.authorizationDependencies();
    let account: MailAccount;
    let isNewAccount: boolean | undefined;
    let previousCredentialReference: string | undefined;
    try {
      const existing =
        await this.dependencies.store.findAccountByProviderIdentity(
          provider,
          authorized.address,
          authorized.authorizationSubject,
        );
      if (existing && existing.userId !== userId) {
        throw new Error('Mail account is already connected to another user.');
      }
      isNewAccount = existing === undefined;
      account = {
        id: existing?.id ?? randomUUID(),
        userId,
        provider,
        address: normalizeAddress(authorized.address),
        displayName: authorized.displayName,
        credentialReference: authorized.credentialReference,
        authorizationSubject: authorized.authorizationSubject,
        scopes: authorized.scopes,
        status: 'active',
        initialSyncReceivedAfter: existing
          ? existing.initialSyncReceivedAfter
          : (initialSyncReceivedAfter ?? undefined),
        automaticSyncIntervalMinutes:
          existing?.automaticSyncIntervalMinutes ??
          this.defaultAutomaticSyncIntervalMinutes,
      };
      const previousIdentities = existing
        ? await this.dependencies.store.listIdentities(existing.id)
        : [];
      const previousByAddress = new Map(
        previousIdentities.map((identity) => [
          identity.address.toLowerCase(),
          identity,
        ]),
      );
      const authorizedIdentities = authorized.identities ?? [
        {
          address: account.address,
          displayName: account.displayName,
          isPrimary: true,
          canSend: true,
        },
      ];
      const identities = authorizedIdentities.map((item) => {
        const previous = previousByAddress.get(item.address.toLowerCase());
        return {
          id: previous?.id ?? randomUUID(),
          accountId: account.id,
          address: normalizeAddress(item.address),
          displayName: item.displayName,
          isPrimary: item.isPrimary,
          canSend: item.canSend,
        };
      });
      const signatures: MailSignature[] = [];
      const providerSignature =
        authorizedIdentities.find(
          (item) =>
            item.isPrimary && (item.signatureText || item.signatureHtml),
        ) ??
        authorizedIdentities.find(
          (item) => item.signatureText || item.signatureHtml,
        );
      const existingSignatures = existing
        ? await this.dependencies.store.listSignatures(account.id)
        : [];
      if (providerSignature && existingSignatures.length === 0) {
        const now = new Date().toISOString();
        signatures.push({
          id: randomUUID(),
          accountId: account.id,
          name: 'Provider signature',
          text: providerSignature.signatureText ?? '',
          html: providerSignature.signatureHtml,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        });
      }
      await this.dependencies.store.saveAuthorizedAccount(
        account,
        identities,
        signatures,
      );
      previousCredentialReference = existing?.credentialReference;
    } catch (error) {
      await credentials.delete(authorized.credentialReference);
      throw error;
    }
    if (
      previousCredentialReference &&
      previousCredentialReference !== authorized.credentialReference
    ) {
      await credentials.delete(previousCredentialReference);
    }
    if (isNewAccount) {
      await this.startSync({ actorId: userId }, { accountId: account.id });
    }
    return toMailAccountView(account);
  }

  private async requireActiveAccount(
    context: MailOperationContext,
    accountId: string,
  ): Promise<MailAccount> {
    const account = await this.dependencies.store.getAccount(accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    if (account.status !== 'active') {
      throw new Error('Mail account is not active.');
    }
    return account;
  }
}

function assertProviderResult<T>(
  result: import('./types.js').MailProviderResult<T>,
): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function assertManagedProviderResult<T>(
  result: import('./types.js').MailProviderResult<T>,
): T {
  if (!result.ok) {
    throw Object.assign(new Error(result.error.message), result.error);
  }
  return result.value;
}

function toManagementActionError(
  cause: unknown,
): import('./types.js').MailPublicError {
  if (isMailProviderError(cause)) return toPublicError(cause);
  return {
    code: 'MAIL_MANAGEMENT_ACTION_FAILED',
    category: 'unknown',
    retryable: false,
  };
}

function isMailProviderError(
  value: unknown,
): value is import('./types.js').MailProviderError {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === 'string' &&
    typeof value.category === 'string' &&
    (MAIL_PROVIDER_ERROR_CATEGORIES as readonly string[]).includes(
      value.category,
    ) &&
    typeof value.retryable === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finalizeStream(
  stream: ReadableStream<Uint8Array>,
  finalize: () => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let finalized = false;
  const finish = async (): Promise<void> => {
    if (finalized) return;
    finalized = true;
    reader.releaseLock();
    await finalize();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          controller.close();
          await finish();
        } else {
          controller.enqueue(result.value);
        }
      } catch (error) {
        controller.error(error);
        await finish();
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await finish();
      }
    },
  });
}

async function closeAdapter(adapter: {
  close?(): Promise<void>;
}): Promise<void> {
  try {
    await adapter.close?.();
  } catch {
    // Provider cleanup cannot change the result of a completed command.
  }
}

function normalizeMailLabelColor(
  value: unknown,
  fallback: MailLabelColor = DEFAULT_MAIL_LABEL_COLOR,
): MailLabelColor {
  if (value === undefined || value === null) return fallback;
  if (!isMailLabelColor(value)) {
    throw new TypeError('Mail label color is invalid.');
  }
  return value;
}

function isLocalDraftMessage(
  message: Pick<MailMessage, 'providerMessageId'>,
): boolean {
  return message.providerMessageId.startsWith('local-draft:');
}

function sameDraftContent(
  local: MailMessage | undefined,
  remote: NormalizedMailMessage,
): boolean {
  if (!local) return true;
  return (
    JSON.stringify(draftContent(local)) === JSON.stringify(draftContent(remote))
  );
}

function draftContent(
  message: Pick<
    MailMessage,
    'from' | 'to' | 'cc' | 'bcc' | 'subject' | 'text' | 'html'
  >,
): unknown {
  return {
    from: message.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    text: message.text ?? '',
    html: message.html ?? '',
  };
}

function toDraftConflict(message: NormalizedMailMessage): MailDraftConflict {
  const remote: MailDraftRemoteVersion = {
    providerMessageId: message.providerMessageId,
    providerDraftId: message.providerDraftId,
    providerConversationId: message.providerConversationId,
    from: message.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: message.attachments,
  };
  return { detectedAt: new Date().toISOString(), remote };
}

function normalizedDraftFromMessage(
  message: MailMessage,
): NormalizedMailMessage {
  return {
    providerMessageId: message.providerMessageId,
    providerDraftMessageId: message.providerDraftMessageId,
    providerDraftId: message.providerDraftId,
    providerConversationId: message.conversationId,
    providerFolderIds: [MAIL_LOCAL_DRAFT_FOLDER_ID],
    from: message.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    replyTo: message.replyTo,
    inReplyTo: message.inReplyTo,
    references: message.references,
    subject: message.subject,
    preview: (message.text ?? '').slice(0, 240),
    text: message.text,
    html: message.html,
    read: message.read,
    starred: message.starred,
    draft: true,
    attachments: message.attachments.map((attachment) => {
      const {
        id: _id,
        messageId: _messageId,
        fileReference: _fileReference,
        ...publicAttachment
      } = attachment;
      return publicAttachment;
    }),
  };
}

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function toSyncRunView(run: MailSyncRun): MailSyncRunView {
  return {
    id: run.id,
    accountId: run.accountId,
    mode: run.mode,
    phase: run.phase,
    status: run.status,
    policy: run.policy,
    processedMessages: run.processedMessages,
    processedPages: run.processedPages,
    error: run.error ? toPublicError(run.error) : undefined,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
  };
}

function toSubmissionView(submission: MailSubmission): MailSubmissionView {
  return {
    id: submission.id,
    accountId: submission.accountId,
    status: submission.status,
    providerMessageId: submission.providerMessageId,
    scheduledAt: submission.scheduledAt,
    error: submission.error ? toPublicError(submission.error) : undefined,
  };
}

function toSubmissionLogView(
  submission: import('./types.js').MailStoredSubmission,
): MailSubmissionLogView {
  return {
    ...toSubmissionView(submission),
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}

function toPublicError(
  error: import('./types.js').MailProviderError,
): import('./types.js').MailPublicError {
  return {
    code: error.code,
    category: error.category,
    retryable: error.retryable,
    retryAfterMs: error.retryAfterMs,
  };
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const resolved = value ?? fallback;
  if (
    !Number.isSafeInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    throw new TypeError(
      `Mail sync option must be an integer from ${minimum} through ${maximum}.`,
    );
  }
  return resolved;
}

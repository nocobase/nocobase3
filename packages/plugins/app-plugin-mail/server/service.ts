import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type {
  MailAccountView,
  MailAccount,
  MailAttachmentContent,
  MailAuthorizationStartResult,
  MailCompleteAuthorizationInput,
  MailListMessagesInput,
  MailListConversationMessagesInput,
  MailManagedAccountView,
  MailFolder,
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
  MailProviderConfig,
  MailProviderContext,
  MailProviderRegistry,
  MailProviderView,
  MailOutboundAttachmentStorage,
  MailOutboundAttachmentView,
  MailUploadAttachmentInput,
} from './types.js';
import { SendMailOperation } from './operations/send-mail.js';
import { toMailAccountView } from './store.js';
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
  readonly registry?: MailProviderRegistry;
  readonly providerContext?: MailProviderContext;
  readonly credentials?: MailCredentialVault;
  readonly resolveProviderConfig?: (
    provider: import('./types.js').MailProviderIdentity,
  ) => MailProviderConfig;
  readonly listProviderConfigs?: () => readonly MailProviderConfig[];
  readonly outboundAttachments?: MailOutboundAttachmentStorage;
}

export class DefaultMailService implements MailService {
  private readonly sendMail: SendMailOperation;

  public constructor(
    private readonly dependencies: DefaultMailServiceDependencies,
  ) {
    this.sendMail = new SendMailOperation({
      ...dependencies,
      outbox: dependencies.outbox,
    });
  }

  public listProviders(): Promise<readonly MailProviderView[]> {
    const registry = this.dependencies.registry;
    const listConfigs = this.dependencies.listProviderConfigs;
    if (!registry || !listConfigs) return Promise.resolve([]);
    return Promise.resolve(
      listConfigs().flatMap((config) => {
        const definition = registry.definition(config.type);
        if (!definition || config.enabled === false) return [];
        try {
          return [
            {
              type: definition.type,
              name: config.name,
              label: definition.label,
              capabilities: definition.capabilities,
            },
          ];
        } catch {
          return [];
        }
      }),
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
      let account: MailAccount;
      let previousCredentialReference: string | undefined;
      try {
        const existing =
          await this.dependencies.store.findAccountByProviderIdentity(
            transaction.provider,
            result.value.address,
            result.value.authorizationSubject,
          );
        if (existing && existing.userId !== transaction.userId) {
          throw new Error('Mail account is already connected to another user.');
        }
        const accounts = await this.dependencies.store.listAccounts(
          transaction.userId,
        );
        account = {
          id: existing?.id ?? randomUUID(),
          userId: transaction.userId,
          provider: transaction.provider,
          address: normalizeAddress(result.value.address),
          displayName: result.value.displayName,
          credentialReference: result.value.credentialReference,
          authorizationSubject: result.value.authorizationSubject,
          scopes: result.value.scopes,
          status: 'active',
          isDefault: existing?.isDefault ?? accounts.length === 0,
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
        const authorizedIdentities = result.value.identities ?? [
          {
            address: account.address,
            displayName: account.displayName,
            isPrimary: true,
            canSend: true,
          },
        ];
        const identities = authorizedIdentities.map((authorized) => {
          const previous = previousByAddress.get(
            authorized.address.toLowerCase(),
          );
          return {
            id: previous?.id ?? randomUUID(),
            accountId: account.id,
            address: normalizeAddress(authorized.address),
            displayName: authorized.displayName,
            isPrimary: authorized.isPrimary,
            canSend: authorized.canSend,
          };
        });
        const signatures: MailSignature[] = [];
        for (const [index, authorized] of authorizedIdentities.entries()) {
          if (!authorized.signatureText && !authorized.signatureHtml) continue;
          const identity = identities[index];
          const existingSignatures = previousByAddress.has(
            authorized.address.toLowerCase(),
          )
            ? await this.dependencies.store.listSignatures(identity.id)
            : [];
          if (existingSignatures.length > 0) continue;
          const now = new Date().toISOString();
          signatures.push({
            id: randomUUID(),
            identityId: identity.id,
            name: 'Provider signature',
            text: authorized.signatureText ?? '',
            html: authorized.signatureHtml,
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
        await credentials.delete(result.value.credentialReference);
        throw error;
      }
      if (
        previousCredentialReference &&
        previousCredentialReference !== result.value.credentialReference
      ) {
        await credentials.delete(previousCredentialReference);
      }
      return toMailAccountView(account);
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
    if (input.isDefault) {
      return toMailAccountView(
        await this.dependencies.store.setDefaultAccount(
          context.actorId,
          account.id,
        ),
      );
    }
    if (input.status) {
      if (
        input.status === 'active' &&
        !['active', 'suspended'].includes(account.status)
      ) {
        throw new Error('This Mail account must be reauthorized.');
      }
      return toMailAccountView(
        await this.dependencies.store.saveAccount({
          ...account,
          status: input.status,
        }),
      );
    }
    return toMailAccountView(account);
  }

  public async removeAccount(
    context: MailOperationContext,
    accountId: string,
  ): Promise<void> {
    const account = await this.dependencies.store.getAccount(accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    if (await this.dependencies.store.findActiveSyncRun(accountId)) {
      throw new Error('Wait for mailbox synchronization to finish first.');
    }
    if (
      !(await this.dependencies.store.markAccountRemoving(
        account.id,
        context.actorId,
      ))
    ) {
      throw new Error('Mail account was not found.');
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
      await pushAdapter?.close?.();
      throw new Error('Mail account was not found.');
    }
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
      await pushAdapter?.close?.();
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

  public async listFolders(
    context: MailOperationContext,
    accountId: string,
  ): Promise<readonly MailFolder[]> {
    await this.requireOwnedAccount(context, accountId);
    return this.dependencies.store.listFolders(accountId);
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
    identityId: string,
  ): Promise<readonly MailSignature[]> {
    await this.requireOwnedIdentity(context, accountId, identityId);
    return this.dependencies.store.listSignatures(identityId);
  }

  public async saveSignature(
    context: MailOperationContext,
    input: import('./types.js').MailSaveSignatureInput,
  ): Promise<MailSignature> {
    await this.requireOwnedIdentity(context, input.accountId, input.identityId);
    const name = input.name.trim();
    if (!name) throw new TypeError('Mail signature name is required.');
    const existing = input.id
      ? await this.dependencies.store.getSignature(input.id)
      : undefined;
    if (input.id && (!existing || existing.identityId !== input.identityId)) {
      throw new Error('Mail signature was not found.');
    }
    const current = await this.dependencies.store.listSignatures(
      input.identityId,
    );
    const now = new Date().toISOString();
    return this.dependencies.store.saveSignature({
      id: input.id ?? randomUUID(),
      identityId: input.identityId,
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
    identityId: string,
    signatureId: string,
  ): Promise<void> {
    await this.requireOwnedIdentity(context, accountId, identityId);
    const signature = await this.dependencies.store.getSignature(signatureId);
    if (
      !signature ||
      signature.identityId !== identityId ||
      !(await this.dependencies.store.deleteSignature(identityId, signatureId))
    ) {
      throw new Error('Mail signature was not found.');
    }
    if (signature.isDefault) {
      const replacement = (
        await this.dependencies.store.listSignatures(identityId)
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
    accountId: string,
    name: string,
  ): Promise<MailFolder> {
    const account = await this.requireActiveAccount(context, accountId);
    const labelName = name.trim();
    if (!labelName) throw new TypeError('Mail label name is required.');
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (!adapter.capabilities.labels || !adapter.createLabel) {
        throw new Error('The selected Mail Provider cannot create labels.');
      }
      const label = assertProviderResult(
        await adapter.createLabel(labelName, context.signal),
      );
      return this.dependencies.store.saveFolder(account.id, label);
    } finally {
      await closeAdapter(adapter);
    }
  }

  public async updateMessageLabels(
    context: MailOperationContext,
    input: import('./types.js').MailUpdateMessageLabelsInput,
  ): Promise<MailMessage> {
    const { account, message } = await this.requireOwnedMessage(
      context,
      input.accountId,
      input.messageId,
    );
    const add = [...new Set(input.addLabelIds ?? [])];
    const remove = [...new Set(input.removeLabelIds ?? [])].filter(
      (id) => !add.includes(id),
    );
    const folders = await this.dependencies.store.listFolders(account.id);
    const labels = new Set(
      folders
        .filter((folder) => folder.kind === 'label' && folder.type === 'custom')
        .map((folder) => folder.providerFolderId),
    );
    if ([...add, ...remove].some((id) => !labels.has(id))) {
      throw new TypeError('Mail label was not found.');
    }
    if (add.length === 0 && remove.length === 0) return message;
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (!adapter.capabilities.labels || !adapter.updateLabels) {
        throw new Error('The selected Mail Provider cannot update labels.');
      }
      assertProviderResult(
        await adapter.updateLabels(message.providerMessageId, {
          addLabelIds: add,
          removeLabelIds: remove,
          signal: context.signal,
        }),
      );
      const updated = await this.dependencies.store.updateMessageLabels(
        account.id,
        message.id,
        add,
        remove,
      );
      if (!updated) throw new Error('Mail message was not found after update.');
      return updated;
    } finally {
      await closeAdapter(adapter);
    }
  }

  public getUnreadCount(context: MailOperationContext): Promise<number> {
    return this.dependencies.store.countUnreadMessages(context.actorId);
  }

  public async startSync(
    context: MailOperationContext,
    input: MailStartSyncInput,
  ): Promise<MailSyncRunView> {
    await this.requireActiveAccount(context, input.accountId);
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
        receivedAfter: input.receivedAfter,
        maxMessages: boundedInteger(input.maxMessages, 10_000, 1, 100_000),
        batchSize: boundedInteger(input.batchSize, 200, 1, 500),
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
      batchSize: run.policy.batchSize,
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
    const adapter = await this.dependencies.adapters.resolve(
      account,
      context.signal,
    );
    try {
      if (!adapter.capabilities.drafts || !adapter.saveDraft) {
        throw new Error('The selected Mail Provider cannot save drafts.');
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
      const providerMessage = await this.sendMail.prepareProviderMessage(
        context,
        input,
      );
      const draft = assertProviderResult(
        existingDraft
          ? await (adapter.updateDraft
              ? adapter.updateDraft(
                  existingDraft.providerDraftId ??
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
      return this.dependencies.store.saveMessage(account.id, {
        ...draft,
        draft: true,
      });
    } finally {
      await closeAdapter(adapter);
    }
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
      return updated;
    } finally {
      await closeAdapter(adapter);
    }
  }

  private async requireOwnedIdentity(
    context: MailOperationContext,
    accountId: string,
    identityId: string,
  ): Promise<import('./types.js').MailIdentity> {
    await this.requireOwnedAccount(context, accountId);
    const identity = await this.dependencies.store.getIdentity(identityId);
    if (!identity || identity.accountId !== accountId) {
      throw new Error('Mail sending identity was not found.');
    }
    return identity;
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
      await this.dependencies.store.deleteMessage(account.id, message.id);
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

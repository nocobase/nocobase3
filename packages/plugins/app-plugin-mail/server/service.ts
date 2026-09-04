import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type {
  MailAccountView,
  MailAccount,
  MailAuthorizationStartResult,
  MailCompleteAuthorizationInput,
  MailListMessagesInput,
  MailMessage,
  MailMessageSummary,
  MailOperationContext,
  MailPage,
  MailService,
  MailStartAuthorizationInput,
  MailStartSyncInput,
  MailStore,
  MailSyncRun,
  MailSyncRunView,
  MailSubmission,
  MailSubmissionView,
  MailCredentialVault,
  MailProviderConfig,
  MailProviderContext,
  MailProviderRegistry,
  MailProviderView,
} from './types.js';
import { SendMailOperation } from './operations/send-mail.js';
import { toMailAccountView } from './store.js';
import type { MailProviderAdapterResolver } from './types.js';

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
}

export class DefaultMailService implements MailService {
  private readonly sendMail: SendMailOperation;

  public constructor(
    private readonly dependencies: DefaultMailServiceDependencies,
  ) {
    this.sendMail = new SendMailOperation(dependencies);
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
    const verifierCredentialReference = await credentials.put({ codeVerifier });
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
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
          await this.dependencies.store.findAccountByProviderAddress(
            transaction.provider,
            result.value.address,
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
          address: result.value.address,
          displayName: result.value.displayName,
          credentialReference: result.value.credentialReference,
          authorizationSubject: result.value.authorizationSubject,
          scopes: result.value.scopes,
          credentialExpiresAt: result.value.credentialExpiresAt,
          status: 'active',
          isDefault: existing?.isDefault ?? accounts.length === 0,
        };
        await this.dependencies.store.saveAuthorizedAccount(account, [
          {
            id: existing
              ? ((await this.dependencies.store.listIdentities(existing.id))[0]
                  ?.id ?? randomUUID())
              : randomUUID(),
            accountId: account.id,
            address: account.address,
            displayName: account.displayName,
            isPrimary: true,
            canSend: true,
          },
        ]);
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

  public async listIdentities(
    context: MailOperationContext,
    accountId: string,
  ): Promise<readonly import('./types.js').MailIdentity[]> {
    await this.requireOwnedAccount(context, accountId);
    return this.dependencies.store.listIdentities(accountId);
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
    const mode = input.mode ?? 'initial';
    if (
      mode === 'incremental' &&
      !(await this.dependencies.store.getSyncCursor(input.accountId))
    ) {
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

  public async sendMessage(
    context: MailOperationContext,
    input: import('./types.js').MailComposeInput,
  ): Promise<MailSubmissionView> {
    return toSubmissionView(await this.sendMail.execute(context, input));
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
  ): Promise<void> {
    const account = await this.dependencies.store.getAccount(accountId);
    if (!account || account.userId !== context.actorId) {
      throw new Error('Mail account was not found.');
    }
    if (account.status !== 'active') {
      throw new Error('Mail account is not active.');
    }
  }
}

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
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
    error: submission.error ? toPublicError(submission.error) : undefined,
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

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  type MailAccount,
  type MailAccountView,
  type MailAuthorizationStartResult,
  type MailCompleteAuthorizationInput,
  type MailConnectAccountInput,
  type MailCredentialVault,
  type MailOperationContext,
  type MailProviderConfig,
  type MailProviderContext,
  type MailProviderRegistry,
  type MailService,
  type MailSignature,
  type MailStartAuthorizationInput,
} from '../types.js';
import { toMailAccountView } from '../views.js';
import { type DefaultMailServiceDependencies } from './dependencies.js';
import { hashState, normalizeAddress } from './input.js';

export class MailAuthorizationService {
  public constructor(
    private readonly dependencies: Pick<
      DefaultMailServiceDependencies,
      | 'store'
      | 'registry'
      | 'resolveProviderConfig'
      | 'credentials'
      | 'providerContext'
    >,
    private readonly sync: Pick<MailService, 'startSync'>,
    private readonly defaultAutomaticSyncIntervalMinutes: number,
  ) {}

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

  private authorizationDependencies(): {
    readonly registry: MailProviderRegistry;
    readonly providerContext: MailProviderContext;
    readonly credentials: MailCredentialVault;
    readonly resolveProviderConfig: (
      provider: import('../types.js').MailProviderIdentity,
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
    provider: import('../types.js').MailProviderIdentity,
    authorized: import('../types.js').MailAuthorizedAccount,
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
      await this.sync.startSync({ actorId: userId }, { accountId: account.id });
    }
    return toMailAccountView(account);
  }
}

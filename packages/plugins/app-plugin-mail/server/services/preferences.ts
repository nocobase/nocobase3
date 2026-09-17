import { randomUUID } from 'node:crypto';
import {
  type MailLabel,
  type MailOperationContext,
  type MailSaveLabelInput,
  type MailSignature,
} from '../../shared/mail.js';
import { requireOwnedAccount } from './access.js';
import { type MailServiceDependencies } from './dependencies.js';
import { normalizeMailLabelColor } from './input.js';

export class MailPreferencesService {
  public constructor(
    private readonly dependencies: MailServiceDependencies<
      | 'createLabel'
      | 'deleteLabel'
      | 'deleteSignature'
      | 'deleteTemplate'
      | 'getAccount'
      | 'getIdentity'
      | 'getSignature'
      | 'listIdentities'
      | 'listLabels'
      | 'listSignatures'
      | 'listTemplates'
      | 'saveSignature'
      | 'saveTemplate'
      | 'updateIdentity'
      | 'updateLabel',
      never
    >,
  ) {}

  public async listIdentities(
    context: MailOperationContext,
    accountId: string,
  ): Promise<readonly import('../../shared/mail.js').MailIdentity[]> {
    await requireOwnedAccount(this.dependencies.store, context, accountId);
    return this.dependencies.store.listIdentities(accountId);
  }

  public async updateIdentity(
    context: MailOperationContext,
    input: import('../../shared/mail.js').MailUpdateIdentityInput,
  ): Promise<import('../../shared/mail.js').MailIdentity> {
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
    await requireOwnedAccount(this.dependencies.store, context, accountId);
    return this.dependencies.store.listSignatures(accountId);
  }

  public async saveSignature(
    context: MailOperationContext,
    input: import('../../shared/mail.js').MailSaveSignatureInput,
  ): Promise<MailSignature> {
    await requireOwnedAccount(
      this.dependencies.store,
      context,
      input.accountId,
    );
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
    await requireOwnedAccount(this.dependencies.store, context, accountId);
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

  public listLabels(
    context: MailOperationContext,
  ): Promise<readonly MailLabel[]> {
    return this.dependencies.store.listLabels(context.actorId);
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

  public listTemplates(
    context: MailOperationContext,
  ): Promise<readonly import('../../shared/mail.js').MailTemplate[]> {
    return this.dependencies.store.listTemplates(context.actorId);
  }

  public async saveTemplate(
    context: MailOperationContext,
    input: import('../../shared/mail.js').MailSaveTemplateInput,
  ): Promise<import('../../shared/mail.js').MailTemplate> {
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
}

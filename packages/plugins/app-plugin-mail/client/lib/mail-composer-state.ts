import type {
  MailAccountView,
  MailBulkComposeInput,
  MailComposeInput,
  MailDraftConflict,
  MailIdentity,
  MailMessage,
  MailOutboundAttachmentView,
  MailProviderCapabilities,
  MailProviderView,
  MailSignature,
} from '../mail-client.js';
import { replaceMailSignatureContent } from './mail-signature.js';
import { sanitizeMailHtml } from './mail-template.js';
export interface ComposerState {
  readonly mode: 'new' | 'reply' | 'forward' | 'edit';
  readonly relatedMessageId?: string;
  readonly draftMessageId?: string;
  readonly fromAddress?: string;
  readonly to: string;
  readonly cc: string;
  readonly bcc: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly scheduledAt: string;
  readonly draftConflict?: MailDraftConflict;
}

export const EMPTY_COMPOSER: ComposerState = {
  mode: 'new',
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  text: '',
  html: '',
  scheduledAt: '',
};

export interface ComposerRecoverySnapshot {
  readonly version: 1;
  readonly accountId: string;
  readonly identityId: string;
  readonly signatureId?: string;
  readonly composer: ComposerState;
  readonly composeAttachments: readonly MailOutboundAttachmentView[];
  readonly retainedAttachments: MailMessage['attachments'];
  readonly savedFingerprint?: string;
}

const COMPOSER_RECOVERY_KEY_PREFIX = 'nocobase:mail:composer-recovery:v1:';

export function parseAddressList(
  value: string,
): readonly { address: string }[] {
  return value
    .split(/[;,]/u)
    .map((address) => address.trim())
    .filter(Boolean)
    .map((address) => ({ address }));
}

export function replaceComposerSignature(
  composer: ComposerState,
  signatures: readonly MailSignature[],
  signatureId: string,
): ComposerState {
  return {
    ...composer,
    ...replaceMailSignatureContent(
      { text: composer.text, html: composer.html },
      signatures,
      signatureId,
    ),
  };
}

export function buildComposerInput(
  accountId: string,
  identityId: string,
  signatureId: string,
  composer: ComposerState,
  attachments: readonly MailOutboundAttachmentView[],
  retainedAttachments: MailMessage['attachments'],
): MailComposeInput {
  return {
    accountId,
    identityId,
    signatureId: signatureId === '__none__' ? null : signatureId || undefined,
    to: parseAddressList(composer.to),
    cc: parseAddressList(composer.cc),
    bcc: parseAddressList(composer.bcc),
    subject: composer.subject,
    text: composer.text,
    html: composer.html || undefined,
    inReplyToMessageId:
      composer.mode === 'reply' ? composer.relatedMessageId : undefined,
    forwardOfMessageId:
      composer.mode === 'forward' ? composer.relatedMessageId : undefined,
    scheduledAt: composer.scheduledAt
      ? new Date(composer.scheduledAt).toISOString()
      : undefined,
    draftMessageId: composer.draftMessageId,
    attachmentIds: attachments.map((attachment) => attachment.id),
    retainedAttachmentIds: retainedAttachments.map(
      (attachment) => attachment.id,
    ),
    idempotencyKey: crypto.randomUUID(),
  };
}

export function buildDraftComposerInput(
  accountId: string,
  identityId: string,
  signatureId: string,
  composer: ComposerState,
  attachments: readonly MailOutboundAttachmentView[],
  retainedAttachments: MailMessage['attachments'],
): MailComposeInput {
  return {
    ...buildComposerInput(
      accountId,
      identityId,
      signatureId,
      composer,
      attachments,
      retainedAttachments,
    ),
    scheduledAt: undefined,
  };
}

export function mergeProviderDraftBody(
  current: string,
  submitted: string,
  providerValue: string | undefined,
): string {
  if (!providerValue || providerValue === submitted) return current;
  if (!providerValue.startsWith(submitted)) return current;
  const providerSuffix = providerValue.slice(submitted.length);
  return current.endsWith(providerSuffix)
    ? current
    : `${current}${providerSuffix}`;
}

export function composerFingerprint(
  composer: ComposerState,
  identityId: string,
  signatureId: string,
  attachments: readonly MailOutboundAttachmentView[],
  retainedAttachments: MailMessage['attachments'],
): string {
  return JSON.stringify({
    mode: composer.mode,
    relatedMessageId: composer.relatedMessageId,
    fromAddress: composer.fromAddress,
    to: composer.to,
    cc: composer.cc,
    bcc: composer.bcc,
    subject: composer.subject,
    text: composer.text,
    html: composer.html,
    identityId,
    signatureId,
    attachmentIds: attachments.map((attachment) => attachment.id),
    retainedAttachmentIds: retainedAttachments.map(
      (attachment) => attachment.id,
    ),
  });
}

export function readComposerRecovery(
  accountId: string,
): ComposerRecoverySnapshot | undefined {
  try {
    const raw = window.sessionStorage.getItem(composerRecoveryKey(accountId));
    if (!raw) return undefined;
    const snapshot: unknown = JSON.parse(raw);
    if (
      !isComposerRecoverySnapshot(snapshot) ||
      snapshot.accountId !== accountId ||
      !hasRecoveryContent(snapshot)
    ) {
      return undefined;
    }
    return {
      ...snapshot,
      composer: {
        ...snapshot.composer,
        html: sanitizeMailHtml(snapshot.composer.html),
      },
    };
  } catch {
    clearComposerRecovery(accountId);
    return undefined;
  }
}

function hasRecoveryContent(snapshot: ComposerRecoverySnapshot): boolean {
  const { composer } = snapshot;
  return Boolean(
    composer.to.trim() ||
    composer.cc.trim() ||
    composer.bcc.trim() ||
    composer.subject.trim() ||
    composer.text.trim() ||
    composer.scheduledAt ||
    composer.draftMessageId ||
    snapshot.composeAttachments.length ||
    snapshot.retainedAttachments.length,
  );
}

export function writeComposerRecovery(
  snapshot: ComposerRecoverySnapshot,
): void {
  try {
    window.sessionStorage.setItem(
      composerRecoveryKey(snapshot.accountId),
      JSON.stringify(snapshot),
    );
  } catch {
    // Browser privacy settings or storage pressure can disable recovery.
  }
}

export function clearComposerRecovery(accountId: string): void {
  try {
    window.sessionStorage.removeItem(composerRecoveryKey(accountId));
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}

function composerRecoveryKey(accountId: string): string {
  return `${COMPOSER_RECOVERY_KEY_PREFIX}${accountId}`;
}

function isComposerRecoverySnapshot(
  value: unknown,
): value is ComposerRecoverySnapshot {
  if (!isRecord(value) || value.version !== 1) return false;
  if (
    typeof value.accountId !== 'string' ||
    typeof value.identityId !== 'string' ||
    (value.signatureId !== undefined &&
      typeof value.signatureId !== 'string') ||
    !isRecord(value.composer) ||
    !Array.isArray(value.composeAttachments) ||
    !value.composeAttachments.every(isRecoveryAttachment) ||
    !Array.isArray(value.retainedAttachments) ||
    !value.retainedAttachments.every(isRecoveryAttachment) ||
    (value.savedFingerprint !== undefined &&
      typeof value.savedFingerprint !== 'string')
  ) {
    return false;
  }
  const composer = value.composer;
  return (
    ['new', 'reply', 'forward', 'edit'].includes(String(composer.mode)) &&
    ['relatedMessageId', 'draftMessageId', 'fromAddress'].every(
      (field) =>
        composer[field] === undefined || typeof composer[field] === 'string',
    ) &&
    ['to', 'cc', 'bcc', 'subject', 'text', 'html', 'scheduledAt'].every(
      (field) => typeof composer[field] === 'string',
    )
  );
}

function isRecoveryAttachment(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.fileName === 'string' &&
    typeof value.contentType === 'string' &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    value.size >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function toBulkComposeInput(
  input: MailComposeInput,
): MailBulkComposeInput {
  return {
    accountId: input.accountId,
    identityId: input.identityId,
    signatureId: input.signatureId,
    recipients: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachmentIds: input.attachmentIds,
    scheduledAt: input.scheduledAt,
    idempotencyKey: input.idempotencyKey,
  };
}

export function findProviderCapabilities(
  account: MailAccountView | undefined,
  providers: readonly MailProviderView[],
): MailProviderCapabilities | undefined {
  if (!account) return undefined;
  return providers.find(
    (provider) =>
      provider.type === account.provider.type &&
      provider.name === account.provider.name,
  )?.capabilities;
}

export function formatIdentity(identity: MailIdentity): string {
  return identity.displayName
    ? `${identity.displayName} <${identity.address}>`
    : identity.address;
}

export function localDateTimeMinimum(): string {
  const now = new Date(Date.now() + 60_000);
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatAddressList(
  addresses: readonly { address: string; name?: string }[],
): string {
  return addresses.map((address) => address.address).join(', ');
}

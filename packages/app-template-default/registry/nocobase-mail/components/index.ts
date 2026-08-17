export * from "./types";
export { mailApi } from "./mail-api";
export { MailInbox } from "./mail-inbox";
export type { MailInboxProps } from "./mail-inbox";
export { MailToolbar } from "./mail-toolbar";
export { MailTable } from "./mail-table";
export { MailDetail } from "./mail-detail";
export { MailCompose, MailComposeForm } from "./mail-compose";
export type {
  ComposeInitialValues,
  ComposeReference,
  ComposeMode,
  ComposeVariant,
  MailComposeFormProps,
  MailComposeProps,
} from "./mail-compose";
export { MailSendActions } from "./mail-send-actions";
export type { MailSendActionsProps } from "./mail-send-actions";
export { MailRecipientInput } from "./mail-recipient-input";
export type { MailRecipientInputProps } from "./mail-recipient-input";
export { MailComposeAttachments } from "./mail-compose-attachments";
export type { MailComposeAttachmentsProps } from "./mail-compose-attachments";
export { getMailSenderCandidates, resolveMailSender } from "./mail-senders";
export type { MailSenderCandidate } from "./mail-senders";
export { MailRichEditor } from "./mail-rich-editor";
export type { MailRichEditorProps } from "./mail-rich-editor";
export { useMailSignatures } from "./use-mail-signatures";
export type { MailSignatureValues } from "./use-mail-signatures";
export { MailSignatureManager } from "./mail-signature-manager";
export type { MailSignatureManagerProps } from "./mail-signature-manager";
export { applySignature } from "./mail-signatures";
export { useMailTemplates } from "./use-mail-templates";
export type { MailTemplateValues } from "./use-mail-templates";
export { MailTemplateManager } from "./mail-template-manager";
export type { MailTemplateManagerProps } from "./mail-template-manager";
export { useMailMessages } from "./use-mail-messages";
export type {
  UseMailMessagesOptions,
  UseMailMessagesResult,
} from "./use-mail-messages";
export {
  useMailCompose,
  buildComposeInitial,
  canReplyAll,
} from "./use-mail-compose";
export type { UseMailComposeOptions } from "./use-mail-compose";
export { MailLabelBadge } from "./mail-label-badge";
export { MailLabelsEditor } from "./mail-labels-editor";
export { MailLabelManager } from "./mail-label-manager";
export type { MailLabelManagerProps } from "./mail-label-manager";
export { MailNoteEditor } from "./mail-note-editor";
export { MailAttachmentList } from "./mail-attachment-list";
export { createDebouncedDraftSaver } from "./mail-draft-autosave";
export type { DebouncedDraftSaver } from "./mail-draft-autosave";
export { serializeReplyQuote, splitReplyQuote } from "./mail-reply-quote";
export type { MailReplyContent } from "./mail-reply-quote";
export {
  collectInlineContentIds,
  filterInlineAttachments,
  normalizeContentId,
  replaceInlineImageSources,
} from "./mail-inline-images";
export { MailEmpty } from "./mail-empty";
export {
  MailUnreadIcon,
  MailUnreadIndicator,
  MailUnreadProvider,
  useMailUnread,
} from "./mail-unread";
export type {
  MailUnreadIndicatorProps,
  MailUnreadProviderProps,
} from "./mail-unread";
export { MailSettingsDrawer } from "./mail-settings-drawer";
export type { MailSettingsDrawerProps } from "./mail-settings-drawer";
export { MailMassTracking } from "./mail-mass-tracking";
export { useMailMassMessages } from "./use-mail-mass-messages";
export { MailFilters } from "./mail-filters";
export type { MailFilterValue, MailFiltersProps } from "./mail-filters";

import { useCallback, useState } from "react";
import {
  isLocalMailDraft,
  type MailAccount,
  type MailMessage,
  type MailRecipientOption,
} from "./types";
import { MailCompose } from "./mail-compose";
import type {
  ComposeInitialValues,
  ComposeMode,
  ComposeVariant,
} from "./mail-compose";
import { splitReplyQuote } from "./mail-reply-quote";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function originalBodyHtml(message: MailMessage) {
  if (message.bodyHtml) return message.bodyHtml;
  const text = escapeHtml(message.bodyText ?? "");
  return `<p>${text.replace(/\n/g, "<br>")}</p>`;
}

function quoteBlock(header: string, message: MailMessage) {
  return [
    "<p></p>",
    '<div class="nb-mail-quote" style="border-left:2px solid #d4d4d8;padding-left:12px;margin-top:16px;color:#52525b">',
    `<div style="margin-bottom:8px">${header}</div>`,
    originalBodyHtml(message),
    "</div>",
  ].join("");
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function composeReference(message: MailMessage) {
  return {
    from: message.fromUser?.name || message.from,
    date: message.date,
    subject: message.subject,
    preview: message.bodyText || stripHtml(message.bodyHtml || ""),
    html: originalBodyHtml(message),
  };
}

function addressList(
  users: Array<{ address: string }> | undefined,
  raw: string | undefined
) {
  if (users?.length) return users.map((user) => user.address);
  return (raw || "").split(/[,;\n]/).map((value) => value.trim()).filter(Boolean);
}

function normalizeAddress(value: string) {
  return (value.match(/<([^>]+)>/)?.[1] || value).trim().toLocaleLowerCase();
}

export function canReplyAll(message: MailMessage, accountEmails: string[] = []) {
  const own = new Set(
    [message.email, message.identityEmail, ...accountEmails]
      .filter((value): value is string => Boolean(value))
      .map(normalizeAddress)
  );
  const participants = uniqueAddresses(
    [
      message.from,
      ...addressList(message.toUsers, message.to),
      ...addressList(message.ccUsers, message.cc),
    ],
    own
  );
  return participants.length > 1;
}

function uniqueAddresses(addresses: Array<string | undefined>, excluded = new Set<string>()) {
  const seen = new Set<string>();
  return addresses.filter((address): address is string => {
    const normalized = address ? normalizeAddress(address) : "";
    if (!normalized || excluded.has(normalized) || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function buildComposeInitial(
  message: MailMessage,
  mode: ComposeMode,
  accountEmails: string[] = []
): ComposeInitialValues {
  const senderIdentity = message.identityEmail || message.email;
  const senderValues = {
    from: senderIdentity,
    identityEmail: senderIdentity,
    accountEmail: message.email,
  };

  if (mode === "draft") {
    if (!isLocalMailDraft(message)) {
      throw new Error(
        "Provider-backed drafts are read-only here. Edit them in the original mail provider."
      );
    }
    const draftContent = splitReplyQuote(message.bodyHtml || message.bodyText || "");
    return {
      ...senderValues,
      id: message.id,
      isDraft: true,
      to: message.toUsers?.map((user) => user.address).join(", ") || message.to,
      cc: message.ccUsers?.map((user) => user.address).join(", ") || message.cc,
      subject: message.subject,
      body: draftContent.body,
      replyBody: draftContent.replyBody,
      replyTo: message.replyTo,
      attachments: (message.attachments ?? []).flatMap((attachment) =>
        attachment.path
          ? [
              {
                originalname: attachment.originalname || attachment.filename,
                filename: attachment.originalname || attachment.filename,
                path: attachment.path,
                size: attachment.size ?? 0,
                encoding: attachment.encoding || "7bit",
                mimetype:
                  attachment.mimetype || attachment.mimeType || "application/octet-stream",
                mimeType:
                  attachment.mimeType || attachment.mimetype || "application/octet-stream",
              },
            ]
          : []
      ),
    };
  }

  if (mode === "forward") {
    const header = [
      "---------- Forwarded message ----------",
      `From: ${escapeHtml(message.from)}`,
      `Date: ${escapeHtml(message.date)}`,
      `Subject: ${escapeHtml(message.subject ?? "")}`,
    ]
      .map((line) => `<div>${line}</div>`)
      .join("");
    return {
      ...senderValues,
      subject: `Fwd: ${message.subject}`,
      body: quoteBlock(header, message),
      reference: composeReference(message),
    };
  }

  const replyTo = message.replyTo || message.mailId;
  const ownAddresses = new Set(
    [message.email, message.identityEmail, ...accountEmails]
      .filter((value): value is string => Boolean(value))
      .map(normalizeAddress)
  );
  const toAddresses =
    mode === "replyAll"
      ? uniqueAddresses(
          [message.from, ...addressList(message.toUsers, message.to)],
          ownAddresses
        )
      : [message.from];
  const toKeys = new Set(toAddresses.map(normalizeAddress));
  const ccAddresses =
    mode === "replyAll"
      ? uniqueAddresses(
          addressList(message.ccUsers, message.cc),
          new Set([...ownAddresses, ...toKeys])
        )
      : [];

  return {
    ...senderValues,
    to: toAddresses.join(", "),
    cc: ccAddresses.join(", ") || undefined,
    subject: message.subject?.startsWith("Re:")
      ? message.subject
      : `Re: ${message.subject}`,
    replyTo,
    body: "",
    replyBody: originalBodyHtml(message),
    reference: composeReference(message),
  };
}

export interface UseMailComposeOptions {
  accounts?: MailAccount[];
  onSent?: () => void;
  variant?: ComposeVariant;
  allowScheduleSend?: boolean;
  allowBulkSend?: boolean;
  autoSaveDraft?: boolean;
  defaultBulkIntervalMs?: number;
  recipientOptions?: MailRecipientOption[];
  onAccountChange?: (account: MailAccount) => void;
}

export function useMailCompose(options: UseMailComposeOptions = {}) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<ComposeInitialValues>();
  const [mode, setMode] = useState<ComposeMode>("new");

  const openCompose = useCallback(
    (values?: ComposeInitialValues, nextMode: ComposeMode = "new") => {
      setInitial(values);
      setMode(nextMode);
      setOpen(true);
    },
    []
  );

  const reply = useCallback(
    (message: MailMessage, nextMode: ComposeMode = "reply") => {
      const accountEmails = (options.accounts ?? []).flatMap((account) => [
        account.email,
        ...(account.identities?.map((identity) => identity.email) ?? []),
      ]);
      openCompose(buildComposeInitial(message, nextMode, accountEmails), nextMode);
    },
    [options.accounts, openCompose]
  );

  const close = useCallback(() => setOpen(false), []);

  const composeDialog = (
    <MailCompose
      open={open}
      onOpenChange={setOpen}
      accounts={options.accounts}
      initial={initial}
      mode={mode}
      onSent={options.onSent}
      variant={options.variant}
      allowScheduleSend={options.allowScheduleSend}
      allowBulkSend={options.allowBulkSend}
      autoSaveDraft={options.autoSaveDraft}
      defaultBulkIntervalMs={options.defaultBulkIntervalMs}
      recipientOptions={options.recipientOptions}
      onAccountChange={options.onAccountChange}
    />
  );

  return { open, openCompose, reply, close, composeDialog };
}

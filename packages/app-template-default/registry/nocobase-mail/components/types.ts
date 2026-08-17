export enum MailBoxType {
  IN = "in",
  OUT = "out",
  DRAFT = "draft",
  TRASH = "trash",
  SPAM = "spam",
  ARCHIVE = "archive",
  MASS = "mass",
  SCHEDULED = "scheduled",
}

export interface MailUser {
  name?: string;
  address: string;
}

export interface MailAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  contentId?: string;
  size?: number;
  originalname?: string;
  path?: string;
  encoding?: string;
  mimetype?: string;
}

export interface MailUploadedAttachment {
  originalname: string;
  filename: string;
  path: string;
  size: number | string;
  encoding: string;
  mimetype: string;
  /** Microsoft sender compatibility; Google continues to use `mimetype`. */
  mimeType?: string;
}

export interface MailLabel {
  id: number;
  label: string;
  color: string;
  description?: string;
}

export const LABEL_COLOR_OPTIONS = [
  "default",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;

export const LABEL_BADGE_CLASSES: Record<string, string> = {
  default: "bg-muted text-muted-foreground",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  green: "bg-green-500/15 text-green-600 dark:text-green-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  yellow: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  gold: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  cyan: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  magenta: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
};

export const LABEL_SWATCH_CLASSES: Record<string, string> = {
  default: "bg-muted-foreground/40",
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  gold: "bg-amber-500",
  cyan: "bg-cyan-500",
  purple: "bg-purple-500",
  magenta: "bg-pink-500",
};

export interface MailNote {
  id: number;
  note: string;
  mailMessageId: number;
}

export interface MailMessage {
  id: number;
  email: string;
  mailId: string;
  rawId: string;
  boxType: MailBoxType | "";
  originalBoxType?: MailBoxType | "";
  isRead: boolean;
  isDraft: boolean;
  from: string;
  identityEmail?: string;
  fromUser?: MailUser;
  to: string;
  toUsers?: MailUser[];
  cc: string;
  ccUsers?: MailUser[];
  bcc: string;
  bccUsers?: MailUser[];
  subject: string;
  replyTo?: string;
  conversationId?: string;
  relatedMessageIds?: string[];
  relatedMessagesIsRead?: boolean;
  relatedMessageLatestDate?: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
  attachments: MailAttachment[];
  labels?: MailLabel[];
  isTodo?: boolean;
  note?: MailNote[];
  children?: MailMessage[];
  childrenMessages?: MailMessage[];
  scheduleSendAt?: string;
  userId?: number;
  user?: {
    id: number;
    nickname?: string;
    email?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export function isLocalMailDraft(
  message: Pick<MailMessage, "isDraft" | "mailId" | "rawId">
) {
  return Boolean(message.isDraft && !message.mailId && !message.rawId);
}

export interface MailAccount {
  id: number;
  type: string;
  email: string;
  userId: number;
  settingId: number;
  config?: Record<string, unknown> & {
    signatures?: MailAccountSignature[];
  };
  identities?: MailIdentity[];
}

export interface MailIdentity {
  id: number;
  email: string;
  accountId: number;
  userId: number;
  isPrimary?: boolean;
  name?: string;
  verificationStatus?: string;
}

export interface MailUserRecord {
  id: number;
  nickname?: string;
  email?: string;
  username?: string;
}

export interface MailRecipientOption {
  email: string;
  name?: string;
  description?: string;
}

export interface MailAccountSignature {
  id: string;
  name: string;
  content: string;
  default?: boolean;
}

export interface MailSignature {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
}

export interface MailTemplate {
  id: number | string;
  name: string;
  content: string;
  /** Kept for callers migrating from the old local template format. */
  subject?: string;
}

export interface MailSendPayload {
  id?: number;
  from: string;
  accountEmail?: string;
  identityEmail?: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  attachments?: MailUploadedAttachment[];
  replyTo?: string;
  isDraft?: boolean;
  scheduleSendAt?: string;
}

export enum MailMassMessageStatus {
  PENDING = "pending",
  SENDING = "sending",
  SENT = "sent",
  FAILED = "failed",
  CANCELED = "canceled",
  SOME_SENT = "some_sent",
}

export interface MailMassMessage {
  id: number;
  parentId?: number | null;
  interval: number;
  message: MailSendPayload;
  from: string;
  to: string;
  sendAt?: string | null;
  status: MailMassMessageStatus;
  result?: unknown;
  children?: MailMassMessage[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MailMassListResponse {
  rows: MailMassMessage[];
  count: number;
}

export interface MailMassSendSettings {
  /** Delay between two recipients, in milliseconds. */
  interval?: number;
}

export type MailScope = "all" | "personal";

export interface MailListParams {
  page?: number;
  pageSize?: number;
  boxType?: MailBoxType;
  isRead?: boolean;
  search?: string;
  labelId?: number;
  sort?: string;
  scope?: MailScope;
  userId?: number;
  filter?: Record<string, unknown>;
}

export interface MailListResponse {
  rows: MailMessage[];
  count: number;
}

export type MailColumnId =
  | "from"
  | "to"
  | "subject"
  | "date"
  | "boxType"
  | "isRead"
  | "email"
  | "user"
  | "labels"
  | "attachments";

export const MAIL_COLUMN_LABELS: Record<MailColumnId, string> = {
  from: "From",
  to: "To",
  subject: "Subject",
  date: "Date",
  boxType: "Folder",
  isRead: "Status",
  email: "Mailbox",
  user: "Owner",
  labels: "Labels",
  attachments: "Attachments",
};

export const DEFAULT_MAIL_COLUMNS: MailColumnId[] = [
  "from",
  "subject",
  "boxType",
  "date",
  "isRead",
  "labels",
];

import { nocobaseClient } from "@nocobase/portal-sdk/client";
import type {
  MailAccount,
  MailIdentity,
  MailLabel,
  MailListParams,
  MailListResponse,
  MailMassSendSettings,
  MailMassListResponse,
  MailMassMessage,
  MailMessage,
  MailNote,
  MailSendPayload,
  MailTemplate,
  MailUploadedAttachment,
  MailUserRecord,
} from "./types";

function parseListResponse(payload: unknown): MailListResponse {
  if (!payload || typeof payload !== "object") return { rows: [], count: 0 };
  const obj = payload as {
    data?: unknown;
    meta?: { count?: number };
    rows?: unknown;
    count?: number;
  };
  if (Array.isArray(obj.data)) {
    return { rows: obj.data, count: obj.meta?.count ?? obj.data.length };
  }
  if (Array.isArray(obj.rows)) {
    return { rows: obj.rows, count: obj.count ?? obj.rows.length };
  }
  if (Array.isArray(payload)) {
    return { rows: payload, count: payload.length };
  }
  return { rows: [], count: 0 };
}

export const mailApi = {
  listMessages(params: MailListParams = {}): Promise<MailListResponse> {
    const filter: Record<string, unknown> = {};
    if (params.boxType) filter.boxType = { $in: [params.boxType] };
    if (params.isRead !== undefined) filter.isRead = params.isRead;
    if (params.labelId) filter["labels.id"] = { $in: [params.labelId] };
    if (params.userId !== undefined) filter.userId = params.userId;
    if (params.search) {
      filter.$or = [
        { subject: { $includes: params.search } },
        { from: { $includes: params.search } },
        { to: { $includes: params.search } },
      ];
    }
    if (params.filter) Object.assign(filter, params.filter);

    const action = params.scope === "personal" ? "listPerson" : "list";

    return nocobaseClient
      .action<unknown>("mailMessages", action, {
        query: {
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 20,
          subjectMerge: true,
          appends: "user",
          ...(Object.keys(filter).length
            ? { filter: JSON.stringify(filter) }
            : {}),
          sort: params.sort ?? "-relatedMessageLatestDate",
        },
        unwrap: "none",
      })
      .then(parseListResponse);
  },

  getMessage(id: number | string): Promise<MailMessage> {
    return nocobaseClient.action<MailMessage>("mailMessages", "get", {
      query: { filterByTk: id, appends: "children,labels,note" },
    });
  },

  trashMessages(
    ids: (number | string)[],
    moveToTrash = true
  ): Promise<unknown> {
    return nocobaseClient.action("mailMessages", "trash", {
      body: { filterByTk: ids, moveToTrash },
    });
  },

  destroyMessages(ids: (number | string)[]): Promise<unknown> {
    return nocobaseClient.action("mailMessages", "destroy", {
      query: { filterByTk: ids },
    });
  },

  cancelScheduled(id: number | string): Promise<unknown> {
    return nocobaseClient.action("mailMessages", "cancelTimelySend", {
      query: { id },
    });
  },

  setRead(mailIds: string[], isRead: boolean): Promise<unknown> {
    return nocobaseClient.action("mail", "messageSetReaded", {
      body: { mailIds, isRead },
    });
  },

  send(payload: MailSendPayload): Promise<unknown> {
    return nocobaseClient.action("mail", "messageSend", { body: payload });
  },

  massSend(
    payload: MailSendPayload,
    settings: MailMassSendSettings = {}
  ): Promise<unknown> {
    return nocobaseClient.action("mailMassMessages", "send", {
      body: {
        data: payload,
        mailSendSetting: settings,
      },
    });
  },

  async listMassMessages(
    parentId: number | null = null
  ): Promise<MailMassListResponse> {
    const pageSize = 100;
    const rows: MailMassMessage[] = [];
    let page = 1;
    let count = 0;

    do {
      const payload = await nocobaseClient.action<unknown>(
        "mailMassMessages",
        "list",
        {
          query: {
            page,
            pageSize,
            filter: JSON.stringify({ parentId }),
            sort: "-createdAt",
          },
          unwrap: "none",
        }
      );
      const parsed = parseListResponse(payload);
      const nextRows = parsed.rows as unknown as MailMassMessage[];
      rows.push(...nextRows);
      count = parsed.count;
      if (!nextRows.length) break;
      page += 1;
    } while (rows.length < count);

    return { rows, count };
  },

  cancelMassMessage(id: number | string): Promise<unknown> {
    return nocobaseClient.action("mailMassMessages", "cancel", {
      body: { id },
    });
  },

  resendMassMessage(id: number | string): Promise<unknown> {
    return nocobaseClient.action("mailMassMessages", "resend", {
      body: { id },
    });
  },

  uploadAttachment(file: File): Promise<MailUploadedAttachment> {
    const formData = new FormData();
    formData.append("file", file);
    return nocobaseClient
      .action<MailUploadedAttachment>("mail", "messageAttachmentUpload", {
        body: formData,
      })
      .then((attachment) => ({
        ...attachment,
        // Google reads originalname/mimetype; Microsoft reads filename/mimeType.
        // Keep both pairs aligned so recipients see the real file name and type.
        filename: attachment.originalname,
        mimeType: attachment.mimetype,
      }));
  },

  saveDraft(payload: MailSendPayload): Promise<{ id: number }> {
    return nocobaseClient.action<{ id: number }>("mail", "messageSavingDraft", {
      body: payload,
    });
  },

  sync(emails: string[]): Promise<unknown> {
    return nocobaseClient.action("mail", "messagesSync", { body: { emails } });
  },

  unreadCount(): Promise<number> {
    return nocobaseClient
      .action<unknown>("mail", "messageUnreadCount")
      .then((value) => {
        if (typeof value === "number") return value;
        if (value && typeof value === "object" && "count" in value) {
          const count = Number((value as { count?: unknown }).count);
          return Number.isFinite(count) ? count : 0;
        }
        return 0;
      });
  },

  getAccounts(): Promise<MailAccount[]> {
    return nocobaseClient.action<MailAccount[]>("mail", "getMailAccounts");
  },

  findDraft(values: {
    accountEmail: string;
    identityEmail: string;
    to: string[];
  }): Promise<MailMessage | undefined> {
    return nocobaseClient
      .action<MailMessage | undefined>("mailMessages", "get", {
        query: {
          filter: JSON.stringify({
            isDraft: true,
            from: values.identityEmail,
            email: values.accountEmail,
            to: values.to,
          }),
          appends: "labels,note",
        },
      })
      .then((draft) => draft || undefined);
  },

  getOAuthUrl(
    type: "google" | "microsoft",
    options: { email?: string; reauthorize?: boolean } = {}
  ): Promise<string> {
    return nocobaseClient
      .action<{ url?: string }>("mail", "oauth2url", {
        query: { type, ...options },
      })
      .then((response) => response.url || "");
  },

  deleteAccount(email: string): Promise<unknown> {
    return nocobaseClient.action("mail", "deleteMailAccount", {
      body: { email },
    });
  },

  resyncAccount(email: string): Promise<unknown> {
    return nocobaseClient.action("mail", "messagesResync", {
      body: { email },
    });
  },

  syncAliases(email: string): Promise<MailIdentity[]> {
    return nocobaseClient
      .action<MailIdentity[]>("mail", "accountIdentitiesSync", {
        body: { email },
      })
      .then((identities) => (Array.isArray(identities) ? identities : []));
  },

  getUsers(): Promise<MailUserRecord[]> {
    return nocobaseClient
      .action<MailUserRecord[]>("users", "list", {
        query: { pageSize: 100 },
      })
      .then((res) => (Array.isArray(res) ? res : []));
  },

  getLabels(userId?: number | string): Promise<MailLabel[]> {
    const filter =
      userId !== undefined ? { createdBy: { id: userId } } : undefined;
    return nocobaseClient
      .action<MailLabel[]>("mailMessageLabels", "list", {
        query: {
          paginate: false,
          ...(filter ? { filter: JSON.stringify(filter) } : {}),
        },
      })
      .then((res) => (Array.isArray(res) ? res : []));
  },

  createLabel(values: {
    label: string;
    color: string;
    description?: string;
  }): Promise<MailLabel> {
    return nocobaseClient.action<MailLabel>("mailMessageLabels", "create", {
      body: values,
    });
  },

  updateLabel(
    id: number | string,
    values: { label: string; color: string; description?: string }
  ): Promise<MailLabel> {
    return nocobaseClient.action<MailLabel>("mailMessageLabels", "update", {
      query: { filterByTk: id },
      body: values,
    });
  },

  deleteLabel(id: number | string): Promise<unknown> {
    return nocobaseClient.action("mailMessageLabels", "destroy", {
      query: { filterByTk: id },
    });
  },

  getTemplates(): Promise<MailTemplate[]> {
    return nocobaseClient
      .action<MailTemplate[]>("mailTemplates", "list", {
        query: { paginate: false, sort: "createdAt" },
      })
      .then((res) => (Array.isArray(res) ? res : []));
  },

  createTemplate(values: {
    name: string;
    content: string;
  }): Promise<MailTemplate> {
    return nocobaseClient.action<MailTemplate>("mailTemplates", "create", {
      body: values,
    });
  },

  updateTemplate(
    id: number | string,
    values: { name: string; content: string }
  ): Promise<MailTemplate> {
    return nocobaseClient.action<MailTemplate>("mailTemplates", "update", {
      query: { filterByTk: id },
      body: values,
    });
  },

  deleteTemplate(id: number | string): Promise<unknown> {
    return nocobaseClient.action("mailTemplates", "destroy", {
      query: { filterByTk: id },
    });
  },

  updateAccount(
    id: number | string,
    values: Partial<MailAccount>
  ): Promise<MailAccount> {
    return nocobaseClient.action<MailAccount>("mailAccounts", "update", {
      query: { filterByTk: id },
      body: values,
    });
  },

  setMessageLabels(
    messageId: number | string,
    labelIds: number[]
  ): Promise<unknown> {
    return nocobaseClient.action("mailMessages", "update", {
      query: { filterByTk: messageId },
      body: { labels: labelIds },
    });
  },

  setTodo(messageId: number | string, isTodo: boolean): Promise<unknown> {
    return nocobaseClient.action("mailMessages", "update", {
      query: { filterByTk: messageId },
      body: { isTodo },
    });
  },

  setBoxType(messageId: number | string, boxType: string): Promise<unknown> {
    return nocobaseClient.action("mailMessages", "update", {
      query: { filterByTk: messageId },
      body: { boxType },
    });
  },

  createNote(messageId: number | string, note: string): Promise<MailNote> {
    return nocobaseClient.action<MailNote>("mailMessageNotes", "create", {
      body: { mailMessageId: messageId, note },
    });
  },

  updateNote(
    noteId: number | string,
    messageId: number | string,
    note: string
  ): Promise<MailNote> {
    return nocobaseClient.action<MailNote>("mailMessageNotes", "update", {
      query: { filterByTk: noteId },
      body: { mailMessageId: messageId, note },
    });
  },

  attachmentUrl(messageId: number | string, attachmentId: string): string {
    return nocobaseClient
      .buildUrl("mail:messageAttachmentGet", {
        id: messageId,
        attachmentId,
      })
      .toString();
  },

  inlineImageUrl(messageId: number | string, contentId: string): string {
    return nocobaseClient
      .buildUrl("mail:messageContentPreview", { messageId, contentId })
      .toString();
  },

  async fetchInlineImage(
    messageId: number | string,
    contentId: string
  ): Promise<Blob> {
    const response = await fetch(this.inlineImageUrl(messageId, contentId), {
      headers: nocobaseClient.getHeaders({
        withAclMeta: false,
        headers: { Accept: "image/*" },
      }),
    });
    if (!response.ok) {
      throw new Error(`Inline image request failed (${response.status})`);
    }
    return response.blob();
  },
};

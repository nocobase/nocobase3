import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PenLine } from "lucide-react";
import { toast } from "sonner";
import type {
  MailAccount,
  MailColumnId,
  MailLabel,
  MailMessage,
  MailNote,
  MailScope,
} from "./types";
import { isLocalMailDraft, MailBoxType } from "./types";
import { mailApi } from "./mail-api";
import { useMailMessages } from "./use-mail-messages";
import { useMailCompose, buildComposeInitial } from "./use-mail-compose";
import type { ComposeMode } from "./mail-compose";
import { MailToolbar } from "./mail-toolbar";
import { MailTable } from "./mail-table";
import { MailDetail } from "./mail-detail";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useMailUnread } from "./mail-unread";

type MailReadState = Pick<
  MailMessage,
  | "mailId"
  | "isRead"
  | "relatedMessageIds"
  | "relatedMessagesIsRead"
  | "children"
  | "childrenMessages"
>;

export function isMessageUnread(
  message: Pick<MailMessage, "isRead" | "relatedMessagesIsRead">
) {
  return !message.isRead || message.relatedMessagesIsRead === false;
}

export function collectMessageMailIds(message: MailReadState) {
  const conversation = [
    message,
    ...(message.children ?? []),
    ...(message.childrenMessages ?? []),
  ];

  return Array.from(
    new Set(
      conversation.flatMap((item) => [
        item.mailId,
        ...(item.relatedMessageIds ?? []),
      ])
    )
  ).filter((mailId): mailId is string => Boolean(mailId));
}

export function markMessageRead(message: MailMessage): MailMessage {
  return { ...message, isRead: true, relatedMessagesIsRead: true };
}

export function markMessageUnread(message: MailMessage): MailMessage {
  return { ...message, isRead: false, relatedMessagesIsRead: false };
}

export interface MailInboxProps {
  scope?: MailScope;
  boxType?: MailBoxType;
  isRead?: boolean;
  labelId?: number;
  columns?: MailColumnId[];
  filter?: Record<string, unknown>;
  userId?: number;
  pageSize?: number;
  showToolbar?: boolean;
  toolbarActions?: ReactNode;
  className?: string;
}

export function MailInbox({
  scope,
  boxType,
  isRead,
  labelId,
  columns,
  filter,
  userId,
  pageSize = 15,
  showToolbar = true,
  toolbarActions,
  className,
}: MailInboxProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeMessage, setActiveMessage] = useState<MailMessage | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [permanentDeleteIds, setPermanentDeleteIds] = useState<number[]>([]);
  const openMessageSequence = useRef(0);
  const { refresh: refreshUnread } = useMailUnread();

  const {
    messages,
    total,
    loading,
    page,
    pageSize: effectivePageSize,
    setPage,
    refresh,
    setMessages,
  } = useMailMessages({ scope, boxType, isRead, labelId, search, filter, userId, pageSize });

  const selectedMessages = messages.filter((message) => selectedIds.has(message.id));
  const actionMode: "normal" | "trash" | "draft" | "providerDraft" | "scheduled" | "mixed" =
    selectedMessages.length &&
    selectedMessages.every((message) => message.boxType === MailBoxType.TRASH)
      ? "trash"
      : selectedMessages.length && selectedMessages.every(isLocalMailDraft)
        ? "draft"
        : selectedMessages.length &&
            selectedMessages.every(
              (message) => message.isDraft && !isLocalMailDraft(message)
            )
          ? "providerDraft"
        : selectedMessages.length &&
            selectedMessages.every(
              (message) => message.boxType === MailBoxType.SCHEDULED
            )
          ? "scheduled"
          : selectedMessages.some(
                (message) =>
                  message.isDraft ||
                  message.boxType === MailBoxType.SCHEDULED ||
                  message.boxType === MailBoxType.TRASH
              )
            ? "mixed"
            : "normal";

  const { openCompose, composeDialog } = useMailCompose({
    accounts,
    onSent: refresh,
    onAccountChange: (account) =>
      setAccounts((prev) =>
        prev.map((item) => (item.id === account.id ? account : item))
      ),
  });

  useEffect(() => {
    mailApi
      .getAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  const openMessage = useCallback(
    async (message: MailMessage) => {
      const sequence = ++openMessageSequence.current;
      if (isLocalMailDraft(message)) {
        try {
          const detail = await mailApi.getMessage(message.id);
          if (sequence !== openMessageSequence.current) return;
          openCompose(buildComposeInitial(detail, "draft"), "draft");
        } catch (error) {
          if (sequence !== openMessageSequence.current) return;
          toast.error(
            error instanceof Error ? error.message : "Failed to load draft"
          );
        }
        return;
      }
      setActiveMessage(message);
      setDetailOpen(true);
      setDetailLoading(true);
      try {
        const detail = await mailApi.getMessage(message.id);
        if (sequence !== openMessageSequence.current) return;
        setActiveMessage(detail);
        if (isMessageUnread(message)) {
          const mailIds = collectMessageMailIds(detail);
          if (mailIds.length) {
            try {
              await mailApi.setRead(mailIds, true);
              if (sequence !== openMessageSequence.current) return;
              setActiveMessage(markMessageRead(detail));
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === message.id ? markMessageRead(m) : m
                )
              );
              refreshUnread();
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Failed to mark message as read"
              );
            }
          }
        }
      } catch (error) {
        if (sequence !== openMessageSequence.current) return;
        toast.error(error instanceof Error ? error.message : "Failed to load message");
      } finally {
        if (sequence === openMessageSequence.current) setDetailLoading(false);
      }
    },
    [openCompose, setMessages, refreshUnread]
  );

  const toggleSelect = useCallback((id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelectionAndRefresh = useCallback(() => {
    setSelectedIds(new Set());
    refresh();
  }, [refresh]);

  const handleSetRead = useCallback(
    async (isRead: boolean) => {
      const mailIds = messages
        .filter((m) => selectedIds.has(m.id))
        .map((m) => m.mailId);
      if (!mailIds.length) return;
      try {
        await mailApi.setRead(mailIds, isRead);
        setMessages((prev) =>
          prev.map((m) => (selectedIds.has(m.id) ? { ...m, isRead } : m))
        );
        setSelectedIds(new Set());
        toast.success(isRead ? "Marked as read" : "Marked as unread");
        refreshUnread();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    },
    [messages, selectedIds, setMessages, refreshUnread]
  );

  const handleDetailMarkUnread = useCallback(
    async (message: MailMessage) => {
      const mailIds = collectMessageMailIds(message);
      if (!mailIds.length) return;
      try {
        await mailApi.setRead(mailIds, false);
        setActiveMessage((prev) =>
          prev?.id === message.id ? markMessageUnread(prev) : prev
        );
        setMessages((prev) =>
          prev.map((item) =>
            item.id === message.id ? markMessageUnread(item) : item
          )
        );
        toast.success("Marked as unread");
        refreshUnread();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to mark message as unread"
        );
      }
    },
    [setMessages, refreshUnread]
  );

  const handleBulkTrash = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await mailApi.trashMessages(ids, true);
      toast.success("Moved to trash");
      clearSelectionAndRefresh();
      refreshUnread();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to move to trash");
    }
  }, [selectedIds, clearSelectionAndRefresh, refreshUnread]);

  const handleBulkRestore = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await mailApi.trashMessages(ids, false);
      toast.success("Messages put back");
      clearSelectionAndRefresh();
      refreshUnread();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to put messages back");
    }
  }, [selectedIds, clearSelectionAndRefresh, refreshUnread]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const emails = accounts.map((a) => a.email);
      if (emails.length) await mailApi.sync(emails);
      toast.success("Mailbox synced");
      clearSelectionAndRefresh();
      refreshUnread();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [accounts, clearSelectionAndRefresh, refreshUnread]);

  const openReply = useCallback(
    (message: MailMessage, mode: ComposeMode) => {
      const accountEmails = accounts.flatMap((account) => [
        account.email,
        ...(account.identities?.map((identity) => identity.email) ?? []),
      ]);
      openCompose(buildComposeInitial(message, mode, accountEmails), mode);
    },
    [accounts, openCompose]
  );

  const handleDetailTrash = useCallback(
    async (message: MailMessage) => {
      try {
        await mailApi.trashMessages([message.id], true);
        toast.success("Moved to trash");
        setDetailOpen(false);
        setActiveMessage(undefined);
        refresh();
        refreshUnread();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to move to trash");
      }
    },
    [refresh, refreshUnread]
  );

  const handleDetailRestore = useCallback(
    async (message: MailMessage) => {
      try {
        await mailApi.trashMessages([message.id], false);
        toast.success("Message put back");
        setDetailOpen(false);
        setActiveMessage(undefined);
        refresh();
        refreshUnread();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to put message back");
      }
    },
    [refresh, refreshUnread]
  );

  const handlePermanentDelete = useCallback(async () => {
    if (!permanentDeleteIds.length) return;
    try {
      await mailApi.destroyMessages(permanentDeleteIds);
      toast.success("Messages permanently deleted");
      if (activeMessage && permanentDeleteIds.includes(activeMessage.id)) {
        setDetailOpen(false);
        setActiveMessage(undefined);
      }
      setPermanentDeleteIds([]);
      clearSelectionAndRefresh();
      refreshUnread();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to permanently delete messages"
      );
    }
  }, [activeMessage, clearSelectionAndRefresh, permanentDeleteIds, refreshUnread]);

  const handleCancelScheduled = useCallback(
    async (message: MailMessage) => {
      try {
        await mailApi.cancelScheduled(message.id);
        const draft = await mailApi.getMessage(message.id);
        setDetailOpen(false);
        setActiveMessage(undefined);
        refresh();
        openCompose(buildComposeInitial(draft, "draft"), "draft");
        toast.success("Scheduled send canceled; message moved to drafts");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to cancel scheduled send"
        );
      }
    },
    [openCompose, refresh]
  );

  const handleToggleTodo = useCallback(
    async (message: MailMessage) => {
      const isTodo = !message.isTodo;
      try {
        await mailApi.setTodo(message.id, isTodo);
        setActiveMessage((prev) =>
          prev && prev.id === message.id ? { ...prev, isTodo } : prev
        );
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, isTodo } : m))
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update todo");
      }
    },
    [setMessages]
  );

  const handleLabelsChange = useCallback(
    (message: MailMessage, labels: MailLabel[]) => {
      setActiveMessage((prev) =>
        prev && prev.id === message.id ? { ...prev, labels } : prev
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, labels } : m))
      );
    },
    [setMessages]
  );

  const handleNoteChange = useCallback(
    (message: MailMessage, note: MailNote | undefined) => {
      const noteArr = note ? [note] : [];
      setActiveMessage((prev) =>
        prev && prev.id === message.id ? { ...prev, note: noteArr } : prev
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, note: noteArr } : m))
      );
    },
    [setMessages]
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <MailTable
        messages={messages}
        loading={loading}
        total={total}
        page={page}
        pageSize={effectivePageSize}
        onPageChange={setPage}
        selectedIds={selectedIds}
        activeId={activeMessage?.id}
        onOpen={openMessage}
        onSelect={toggleSelect}
        columns={columns}
        emptyVariant={search ? "search" : "inbox"}
        trailingAction={
          showToolbar ? (
            <Button size="sm" onClick={() => openCompose()}>
              <PenLine />
              Compose
            </Button>
          ) : undefined
        }
        toolbar={
          showToolbar ? (
            <MailToolbar
              search={search}
              onSearchChange={setSearch}
              selectedCount={selectedIds.size}
              syncing={syncing}
              onSync={handleSync}
              onMarkRead={() => handleSetRead(true)}
              onMarkUnread={() => handleSetRead(false)}
              actionMode={actionMode}
              onRestore={handleBulkRestore}
              onDeleteForever={() => setPermanentDeleteIds(Array.from(selectedIds))}
              onTrash={handleBulkTrash}
              onClearSelection={() => setSelectedIds(new Set())}
              actions={toolbarActions}
            />
          ) : undefined
        }
      />

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side="right"
          className="gap-0 p-0 data-[side=right]:sm:max-w-3xl"
        >
          <div className="flex-1 overflow-y-auto">
            <MailDetail
              message={activeMessage}
              loading={detailLoading}
              onReply={(m) => openReply(m, "reply")}
              onReplyAll={(m) => openReply(m, "replyAll")}
              onForward={(m) => openReply(m, "forward")}
              onToggleTodo={handleToggleTodo}
              onMarkUnread={handleDetailMarkUnread}
              onTrash={handleDetailTrash}
              onRestore={handleDetailRestore}
              onDeleteForever={(message) => setPermanentDeleteIds([message.id])}
              onCancelScheduled={handleCancelScheduled}
              onLabelsChange={handleLabelsChange}
              onNoteChange={handleNoteChange}
            />
          </div>
        </SheetContent>
      </Sheet>

      {composeDialog}

      <AlertDialog
        open={permanentDeleteIds.length > 0}
        onOpenChange={(open) => !open && setPermanentDeleteIds([])}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete messages?</AlertDialogTitle>
            <AlertDialogDescription>
              This action deletes the selected messages from the mail provider and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handlePermanentDelete()}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

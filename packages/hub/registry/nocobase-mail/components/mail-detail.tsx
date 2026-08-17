import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ChevronDown,
  Circle,
  CircleCheckBig,
  Clock3,
  CornerUpLeft,
  CornerUpRight,
  Forward,
  MessagesSquare,
  MailX,
  Paperclip,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  isLocalMailDraft,
  type MailLabel,
  type MailMessage,
  type MailNote,
} from "./types";
import { MailAttachmentList } from "./mail-attachment-list";
import { MailLabelsEditor } from "./mail-labels-editor";
import { MailNoteEditor } from "./mail-note-editor";
import {
  collectInlineContentIds,
  filterInlineAttachments,
  replaceInlineImageSources,
} from "./mail-inline-images";
import { mailApi } from "./mail-api";
import { canReplyAll } from "./use-mail-compose";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function formatFullDate(dateStr?: string) {
  if (!dateStr) return "";
  try {
    return format(parseISO(dateStr), "MMM d, yyyy · HH:mm");
  } catch {
    return dateStr;
  }
}

function displayName(message: MailMessage) {
  return message.fromUser?.name || message.from || "Unknown";
}

function formatAddressList(users?: { name?: string; address: string }[], raw?: string) {
  if (users?.length) {
    return users.map((u) => u.name || u.address).join(", ");
  }
  return raw || "";
}

function initials(name: string) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const MAIL_QUOTE_SELECTORS = [
  '[data-role="reply-quote"]',
  ".gmail_quote",
  'blockquote[type="cite"]',
  // 163 Mail
  "#divNeteaseMailCard",
  ".nui-mail-quote",
  // QQ Mail and Foxmail
  "#isForwardContent",
  "#isReplyContent",
  "#foxmail_quote",
  // Outlook and Hotmail
  "#divRplyFwdMsg",
  ".OutlookMessageHeader",
  // Yahoo Mail
  "#yahoo_quoted",
  // Common quote and reply containers
  "blockquote",
  '[class*="quote"]',
  '[id*="quote"]',
  '[class*="reply"]',
  '[id*="reply"]',
];

function collapseQuotedContent(doc: Document, onHeightChange: () => void) {
  if (doc.querySelector(".mail-quote")) return;

  const nodes = Array.from(
    doc.querySelectorAll(MAIL_QUOTE_SELECTORS.join(","))
  );
  const topLevelNodes = nodes.filter(
    (node) =>
      !nodes.some(
        (otherNode) => otherNode !== node && otherNode.contains(node)
      )
  );
  const quotedContent = topLevelNodes[0];
  if (!quotedContent?.parentNode) return;

  const style = doc.createElement("style");
  style.textContent = `
    img { max-width: 100%; height: auto; }
    .mail-quote { margin-top: 12px; }
    .mail-quote-toggle {
      appearance: none;
      background: transparent;
      border: 0;
      padding: 0;
      cursor: pointer;
      color: #1677ff;
      font: inherit;
      font-size: 12px;
      margin-bottom: 6px;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .mail-quote-toggle .toggle-icon {
      display: inline-block;
      transition: transform 0.2s ease;
      font-size: 10px;
      margin-top: 1px;
    }
    .mail-quote.is-collapsed .toggle-icon { transform: rotate(-90deg); }
    .mail-quote.is-collapsed > *:not(.mail-quote-toggle) { display: none; }
  `;
  doc.head.appendChild(style);

  const wrapper = doc.createElement("div");
  wrapper.className = "mail-quote is-collapsed";
  const toggle = doc.createElement("button");
  toggle.type = "button";
  toggle.className = "mail-quote-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.title = "Show quoted content";
  toggle.append("Replied message");
  const icon = doc.createElement("span");
  icon.className = "toggle-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "▼";
  toggle.appendChild(icon);

  quotedContent.parentNode.insertBefore(wrapper, quotedContent);
  wrapper.append(toggle, quotedContent);
  toggle.addEventListener("click", () => {
    const collapsed = wrapper.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.title = collapsed ? "Show quoted content" : "Hide quoted content";
    requestAnimationFrame(onHeightChange);
  });
}

function MailHtmlBody({
  html,
  messageId,
}: {
  html: string;
  messageId: number | string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [resolvedHtml, setResolvedHtml] = useState(html);

  useEffect(() => {
    const contentIds = collectInlineContentIds(html);
    if (!contentIds.length) {
      setResolvedHtml(html);
      return;
    }

    let active = true;
    const objectUrls: string[] = [];
    void Promise.all(
      contentIds.map(async (contentId) => {
        try {
          const blob = await mailApi.fetchInlineImage(messageId, contentId);
          const objectUrl = URL.createObjectURL(blob);
          if (!active) {
            URL.revokeObjectURL(objectUrl);
            return undefined;
          }
          objectUrls.push(objectUrl);
          return [contentId, objectUrl] as const;
        } catch {
          return undefined;
        }
      })
    ).then((sources) => {
      if (!active) return;
      const sourceMap = new Map(
        sources.filter(
          (source): source is readonly [string, string] => Boolean(source)
        )
      );
      setResolvedHtml(replaceInlineImageSources(html, sourceMap));
    });

    return () => {
      active = false;
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, [html, messageId]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let observer: ResizeObserver | undefined;

    const resize = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc?.body) return;
        collapseQuotedContent(doc, resize);
        frame.style.height = `${doc.body.scrollHeight + 32}px`;
        if (!observer && typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(() => {
            try {
              frame.style.height = `${doc.body.scrollHeight + 32}px`;
            } catch {
              /* frame torn down */
            }
          });
          observer.observe(doc.body);
        }
      } catch {
        /* not measurable */
      }
    };

    frame.addEventListener("load", resize);
    const fallback = setTimeout(resize, 150);

    return () => {
      frame.removeEventListener("load", resize);
      clearTimeout(fallback);
      observer?.disconnect();
    };
  }, [resolvedHtml]);

  return (
    <iframe
      ref={frameRef}
      title="Email content"
      sandbox="allow-same-origin"
      srcDoc={resolvedHtml}
      className="w-full border-0 bg-white transition-[height] duration-200"
      style={{ minHeight: 48 }}
    />
  );
}

function buildThread(message: MailMessage): MailMessage[] {
  const children = message.children?.length
    ? message.children
    : (message.childrenMessages ?? []);
  const seen = new Set<number>();
  const all = [message, ...children].filter((m) => {
    if (m.id == null || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
  return all.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

function formatShortDate(dateStr?: string) {
  if (!dateStr) return "";
  try {
    return format(parseISO(dateStr), "MMM d");
  } catch {
    return "";
  }
}

function MailThreadMessage({
  message,
  expanded,
  onToggle,
  collapsible = true,
  onReply,
  onReplyAll,
  onForward,
}: {
  message: MailMessage;
  expanded: boolean;
  onToggle: () => void;
  collapsible?: boolean;
  onReply?: (message: MailMessage) => void;
  onReplyAll?: (message: MailMessage) => void;
  onForward?: (message: MailMessage) => void;
}) {
  const name = displayName(message);
  const body = message.bodyHtml || message.bodyText || "";
  const visibleAttachments = filterInlineAttachments(
    message.attachments ?? [],
    message.bodyHtml || ""
  );
  const isPlainText = !message.bodyHtml && Boolean(message.bodyText);
  const snippet = (message.bodyText || "").replace(/\s+/g, " ").trim().slice(0, 90);
  const isExpanded = collapsible ? expanded : true;

  const headerContent = (
    <>
      <Avatar size="sm">
        <AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-primary">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="shrink-0 text-sm font-semibold text-foreground">
            {name}
          </span>
          {!isExpanded && snippet && (
            <span className="truncate text-xs text-muted-foreground">
              {snippet}
            </span>
          )}
        </span>
        {isExpanded && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{message.from}</span>
            <span> · to {formatAddressList(message.toUsers, message.to)}</span>
            {message.cc && (
              <span> · cc {formatAddressList(message.ccUsers, message.cc)}</span>
            )}
          </span>
        )}
      </span>
      {visibleAttachments.length ? (
        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {isExpanded ? formatFullDate(message.date) : formatShortDate(message.date)}
      </span>
      {collapsible && (
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-180"
          )}
        />
      )}
    </>
  );

  return (
    <div className="border-b border-border/60 last:border-0">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className={cn(
            "flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-muted/40",
            isExpanded && "bg-muted/25"
          )}
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 px-6 py-3.5 text-left">
          {headerContent}
        </div>
      )}

      {isExpanded && (
        <div className="px-6 pb-5">
          {body ? (
            isPlainText ? (
              <pre className="font-sans text-sm leading-6 whitespace-pre-wrap text-foreground">
                {message.bodyText}
              </pre>
            ) : (
              <MailHtmlBody html={body} messageId={message.id} />
            )
          ) : (
            <p className="py-2 text-sm text-muted-foreground">
              This message has no content.
            </p>
          )}

          {visibleAttachments.length ? (
            <MailAttachmentList
              messageId={message.id}
              attachments={visibleAttachments}
              className="mt-4"
            />
          ) : null}

          {(onReply || onReplyAll || onForward) && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {onReply && (
                <Button variant="outline" size="sm" onClick={() => onReply(message)}>
                  <CornerUpLeft /> Reply
                </Button>
              )}
              {onReplyAll && canReplyAll(message) && (
                <Button variant="outline" size="sm" onClick={() => onReplyAll(message)}>
                  <CornerUpRight /> Reply all
                </Button>
              )}
              {onForward && (
                <Button variant="outline" size="sm" onClick={() => onForward(message)}>
                  <Forward /> Forward
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MailDetail({
  message,
  loading,
  onReply,
  onReplyAll,
  onForward,
  onToggleTodo,
  onMarkUnread,
  onTrash,
  onRestore,
  onDeleteForever,
  onCancelScheduled,
  onLabelsChange,
  onNoteChange,
  className,
}: {
  message?: MailMessage;
  loading: boolean;
  onReply?: (message: MailMessage) => void;
  onReplyAll?: (message: MailMessage) => void;
  onForward?: (message: MailMessage) => void;
  onToggleTodo?: (message: MailMessage) => void;
  onMarkUnread?: (message: MailMessage) => void;
  onTrash?: (message: MailMessage) => void;
  onRestore?: (message: MailMessage) => void;
  onDeleteForever?: (message: MailMessage) => void;
  onCancelScheduled?: (message: MailMessage) => void;
  onLabelsChange?: (message: MailMessage, labels: MailLabel[]) => void;
  onNoteChange?: (message: MailMessage, note: MailNote | undefined) => void;
  className?: string;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!message) {
      setExpandedIds(new Set());
      return;
    }
    const thread = buildThread(message);
    const latest = thread[thread.length - 1];
    setExpandedIds(latest ? new Set([latest.id]) : new Set());
  }, [message]);

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-4 p-6", className)}>
        <Skeleton className="h-7 w-2/3" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <Separator />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
        <Skeleton className="h-3 w-3/6" />
      </div>
    );
  }

  if (!message) return null;

  const thread = buildThread(message);
  const isTrash = message.boxType === "trash";
  const isScheduled = Boolean(message.scheduleSendAt);
  const isProviderDraft = message.isDraft && !isLocalMailDraft(message);

  return (
    <div className={cn("flex flex-col", className)}>
      {isScheduled && (
        <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-6 py-3 text-sm">
          <Clock3 className="size-4 text-amber-600" />
          <span className="flex-1">
            Scheduled for {formatFullDate(message.scheduleSendAt)}
          </span>
          {!message.mailId ? (
            <Button variant="outline" size="sm" onClick={() => onCancelScheduled?.(message)}>
              Cancel and edit
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Cancel this message in the original mail provider.
            </span>
          )}
        </div>
      )}
      {isProviderDraft && (
        <div className="border-b border-blue-500/20 bg-blue-500/10 px-6 py-3 text-sm">
          This draft is stored by the original mail provider and is read-only here.
          Edit or delete it in that mailbox to preserve provider attachments and state.
        </div>
      )}
      <div className="border-b border-border/60 py-5 pl-6 pr-14">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h2 className="min-w-0 text-xl font-semibold tracking-[-0.02em] text-foreground">
                {message.subject || "(no subject)"}
              </h2>
              {thread.length > 1 && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <MessagesSquare className="size-3" />
                  {thread.length} messages
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <MailLabelsEditor
                message={message}
                onChange={(labels) => onLabelsChange?.(message, labels)}
              />
              <MailNoteEditor
                message={message}
                onChange={(note) => onNoteChange?.(message, note)}
              />
            </div>
          </div>

          {!isScheduled && !isProviderDraft && <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Reply"
              onClick={() => onReply?.(message)}
            >
              <CornerUpLeft />
            </Button>
            {canReplyAll(message) && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Reply all"
                onClick={() => onReplyAll?.(message)}
              >
                <CornerUpRight />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              title="Forward"
              onClick={() => onForward?.(message)}
            >
              <Forward />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={Boolean(message.isTodo)}
              title={message.isTodo ? "Remove from todo" : "Add to todo"}
              onClick={() => onToggleTodo?.(message)}
            >
              {message.isTodo ? (
                <CircleCheckBig className="text-primary" />
              ) : (
                <Circle />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Mark as unread"
              onClick={() => onMarkUnread?.(message)}
            >
              <MailX />
            </Button>
            {isTrash ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Put back"
                  onClick={() => onRestore?.(message)}
                >
                  <Undo2 />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Permanently delete"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDeleteForever?.(message)}
                >
                  <Trash2 />
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Move to trash"
                onClick={() => onTrash?.(message)}
              >
                <Trash2 />
              </Button>
            )}
          </div>}
        </div>
      </div>

      <div className="flex flex-col">
        {thread.map((threadMessage) => (
          <MailThreadMessage
            key={threadMessage.id}
            message={threadMessage}
            expanded={expandedIds.has(threadMessage.id)}
            onToggle={() => toggleExpanded(threadMessage.id)}
            collapsible={thread.length > 1}
            onReply={isScheduled || isProviderDraft ? undefined : onReply}
            onReplyAll={isScheduled || isProviderDraft ? undefined : onReplyAll}
            onForward={isScheduled || isProviderDraft ? undefined : onForward}
          />
        ))}
      </div>
    </div>
  );
}

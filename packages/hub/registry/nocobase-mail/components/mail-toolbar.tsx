import {
  MailOpen,
  MailX,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function MailToolbar({
  search,
  onSearchChange,
  selectedCount,
  syncing,
  onSync,
  onMarkRead,
  onMarkUnread,
  actionMode = "normal",
  onRestore,
  onDeleteForever,
  onTrash,
  onClearSelection,
  actions,
  className,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  selectedCount: number;
  syncing: boolean;
  onSync: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  actionMode?:
    | "normal"
    | "trash"
    | "draft"
    | "providerDraft"
    | "scheduled"
    | "mixed";
  onRestore: () => void;
  onDeleteForever: () => void;
  onTrash: () => void;
  onClearSelection: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  const hasSelection = selectedCount > 0;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search messages…"
          className="h-8 pl-8 text-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {hasSelection && (
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs tabular-nums text-muted-foreground">
            {selectedCount} selected
          </span>
          {!['draft', 'providerDraft', 'scheduled', 'mixed'].includes(actionMode) && (
            <>
              <Button variant="ghost" size="icon-sm" title="Mark as read" onClick={onMarkRead}>
                <MailOpen />
              </Button>
              <Button variant="ghost" size="icon-sm" title="Mark as unread" onClick={onMarkUnread}>
                <MailX />
              </Button>
            </>
          )}
          {actionMode === "trash" ? (
            <>
              <Button variant="ghost" size="icon-sm" title="Put back" onClick={onRestore}>
                <Undo2 />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Permanently delete"
                className="text-destructive hover:text-destructive"
                onClick={onDeleteForever}
              >
                <Trash2 />
              </Button>
            </>
          ) : actionMode === "draft" ? (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete drafts"
              className="text-destructive hover:text-destructive"
              onClick={onDeleteForever}
            >
              <Trash2 />
            </Button>
          ) : actionMode === "normal" ? (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Move to trash"
              className="text-destructive hover:text-destructive"
              onClick={onTrash}
            >
              <Trash2 />
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {actionMode === "scheduled"
                ? "Open a scheduled message to cancel it"
                : actionMode === "providerDraft"
                  ? "Edit provider drafts in the original mailbox"
                : "Select messages from one folder state"}
            </span>
          )}
          <Button variant="ghost" size="xs" onClick={onClearSelection}>
            Clear
          </Button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          title="Sync mailbox"
          onClick={onSync}
          disabled={syncing}
        >
          <RefreshCw className={cn(syncing && "animate-spin")} />
          Refresh
        </Button>
        {actions}
      </div>
    </div>
  );
}

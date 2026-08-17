import { Inbox, MailOpen, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";

export function MailEmpty({
  variant = "inbox",
  title,
  description,
  className,
}: {
  variant?: "inbox" | "search" | "detail";
  title?: string;
  description?: string;
  className?: string;
}) {
  const Icon =
    variant === "search" ? SearchX : variant === "detail" ? MailOpen : Inbox;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-20 text-center",
        className
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/60">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">
          {title ??
            (variant === "search"
              ? "No matching messages"
              : variant === "detail"
                ? "Select a message to read"
                : "Your inbox is clear")}
        </p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
          {description ??
            (variant === "search"
              ? "Try a different keyword or clear the filters."
              : variant === "detail"
                ? "Pick a conversation from the list to view its contents."
                : "New messages will appear here once your mailbox syncs.")}
        </p>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, Loader2, RefreshCw, RotateCcw, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { mailApi } from "./mail-api";
import { useMailMassMessages } from "./use-mail-mass-messages";
import { MailMassMessageStatus, type MailMassMessage } from "./types";
import { Badge } from "@/components/ui/badge";
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

const STATUS_STYLES: Record<MailMassMessageStatus, string> = {
  pending: "border-blue-500/25 bg-blue-500/10 text-blue-600",
  sending: "border-blue-500/25 bg-blue-500/10 text-blue-600",
  sent: "border-green-500/25 bg-green-500/10 text-green-600",
  failed: "border-red-500/25 bg-red-500/10 text-red-600",
  canceled: "border-border bg-muted text-muted-foreground",
  some_sent: "border-amber-500/25 bg-amber-500/10 text-amber-600",
};

const STATUS_LABELS: Record<MailMassMessageStatus, string> = {
  pending: "Pending",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  canceled: "Canceled",
  some_sent: "Partially sent",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy · HH:mm");
  } catch {
    return value;
  }
}

function resultText(result: unknown) {
  if (!result) return undefined;
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return "Unknown error";
  }
}

function canCancel(task: MailMassMessage) {
  return [MailMassMessageStatus.PENDING, MailMassMessageStatus.SENDING].includes(
    task.status
  );
}

function canResend(task: MailMassMessage) {
  return [
    MailMassMessageStatus.FAILED,
    MailMassMessageStatus.CANCELED,
    MailMassMessageStatus.SOME_SENT,
  ].includes(task.status);
}

export function MailMassTracking() {
  const roots = useMailMassMessages(null);
  const [expandedId, setExpandedId] = useState<number>();
  const children = useMailMassMessages(expandedId ?? -1, {
    enabled: expandedId !== undefined,
  });
  const [confirm, setConfirm] = useState<{
    action: "cancel" | "resend";
    task: MailMassMessage;
  }>();
  const [working, setWorking] = useState(false);

  const childProgress = useMemo(() => {
    if (!expandedId || !children.messages.length) return undefined;
    const sent = children.messages.filter(
      (message) => message.status === MailMassMessageStatus.SENT
    ).length;
    return { sent, total: children.messages.length };
  }, [children.messages, expandedId]);

  const runAction = async () => {
    if (!confirm) return;
    setWorking(true);
    try {
      if (confirm.action === "cancel") {
        await mailApi.cancelMassMessage(confirm.task.id);
        toast.success("Bulk send task canceled");
      } else {
        await mailApi.resendMassMessage(confirm.task.id);
        toast.success("Bulk send task queued again");
      }
      setConfirm(undefined);
      await Promise.all([roots.refresh(), children.refresh()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk task action failed");
    } finally {
      setWorking(false);
    }
  };

  const taskActions = (task: MailMassMessage) => (
    <div className="flex items-center gap-1">
      {canCancel(task) && (
        <Button
          variant="ghost"
          size="xs"
          onClick={(event) => {
            event.stopPropagation();
            setConfirm({ action: "cancel", task });
          }}
        >
          <StopCircle /> Cancel
        </Button>
      )}
      {canResend(task) && (
        <Button
          variant="ghost"
          size="xs"
          onClick={(event) => {
            event.stopPropagation();
            setConfirm({ action: "resend", task });
          }}
        >
          <RotateCcw /> Resend
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Track delivery, cancel active jobs, and retry failed recipients.
        </p>
        <Button variant="outline" size="sm" onClick={() => void roots.refresh()}>
          <RefreshCw /> Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        {roots.loading && !roots.messages.length ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : roots.messages.length ? (
          roots.messages.map((task) => {
            const expanded = expandedId === task.id;
            const recipients = task.to.split(",").filter(Boolean).length;
            return (
              <div key={task.id} className="border-b last:border-0">
                <div className="grid w-full grid-cols-[minmax(0,1fr)_120px_150px_auto] items-center gap-4 px-4 py-3 hover:bg-muted/40">
                  <button
                    type="button"
                    className="col-span-3 grid grid-cols-subgrid items-center text-left"
                    onClick={() => setExpandedId(expanded ? undefined : task.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {task.message?.subject || "(no subject)"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {recipients} recipients · from {task.from}
                      </span>
                    </span>
                    <Badge variant="outline" className={STATUS_STYLES[task.status]}>
                      {STATUS_LABELS[task.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(task.createdAt)}
                    </span>
                  </button>
                  <span className="flex items-center gap-2">
                    {taskActions(task)}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={expanded ? "Hide recipients" : "Show recipients"}
                      onClick={() => setExpandedId(expanded ? undefined : task.id)}
                    >
                      <ChevronDown
                        className={cn("size-4 transition-transform", expanded && "rotate-180")}
                      />
                    </Button>
                  </span>
                </div>
                {expanded && (
                  <div className="border-t bg-muted/20 px-4 py-3">
                    {children.loading && !children.messages.length ? (
                      <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                    ) : children.messages.length ? (
                      <div className="space-y-2">
                        {childProgress && (
                          <p className="text-xs font-medium text-muted-foreground">
                            {childProgress.sent} of {childProgress.total} sent
                          </p>
                        )}
                        {children.messages.map((child) => (
                          <div
                            key={child.id}
                            className="grid grid-cols-[minmax(0,1fr)_120px_150px_auto] items-center gap-4 rounded-md bg-background px-3 py-2"
                          >
                            <span className="truncate text-sm">{child.to}</span>
                            <Badge variant="outline" className={STATUS_STYLES[child.status]}>
                              {STATUS_LABELS[child.status]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(child.sendAt)}
                            </span>
                            {taskActions(child)}
                            {resultText(child.result) && (
                              <p className="col-span-full text-xs text-destructive">
                                {resultText(child.result)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-3 text-center text-xs text-muted-foreground">
                        No recipient tasks found.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No bulk send tasks yet.
          </p>
        )}
      </div>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "cancel" ? "Cancel bulk send?" : "Resend failed mail?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "cancel"
                ? "Recipients that were already sent will not be recalled."
                : "Only failed or canceled recipients will be queued again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction disabled={working} onClick={() => void runAction()}>
              {working && <Loader2 className="animate-spin" />}
              {confirm?.action === "cancel" ? "Cancel task" : "Resend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

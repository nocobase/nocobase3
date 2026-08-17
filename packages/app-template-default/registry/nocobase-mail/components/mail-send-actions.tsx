import { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, Loader2, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MINUTE = 60_000;

function toDateTimeLocalValue(date: Date) {
  const localTime = date.getTime() - date.getTimezoneOffset() * MINUTE;
  return new Date(localTime).toISOString().slice(0, 16);
}

function defaultScheduleTime() {
  const date = new Date(Date.now() + 10 * MINUTE);
  date.setSeconds(0, 0);
  return toDateTimeLocalValue(date);
}

export interface MailSendActionsProps {
  disabled?: boolean;
  loading?: boolean;
  recipientCount: number;
  allowScheduleSend?: boolean;
  allowBulkSend?: boolean;
  defaultBulkIntervalMs?: number;
  primaryMode?: "send" | "bulk";
  onSend: () => void;
  onScheduleSend: (sendAt: Date) => Promise<boolean>;
  onBulkSend: (intervalMs: number) => Promise<boolean>;
}

export function MailSendActions({
  disabled,
  loading,
  recipientCount,
  allowScheduleSend = true,
  allowBulkSend = true,
  defaultBulkIntervalMs = 2_000,
  primaryMode = "send",
  onSend,
  onScheduleSend,
  onBulkSend,
}: MailSendActionsProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTime, setScheduleTime] = useState(defaultScheduleTime);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkIntervalSeconds, setBulkIntervalSeconds] = useState(
    Math.max(0.1, defaultBulkIntervalMs / 1_000)
  );

  const scheduleDate = useMemo(() => new Date(scheduleTime), [scheduleTime]);
  const validScheduleTime =
    !Number.isNaN(scheduleDate.getTime()) && scheduleDate.getTime() > Date.now();
  const validBulkInterval =
    Number.isFinite(bulkIntervalSeconds) && bulkIntervalSeconds >= 0.1;

  const openSchedule = () => {
    setScheduleTime(defaultScheduleTime());
    setScheduleOpen(true);
  };

  const handleScheduleSend = async () => {
    if (!validScheduleTime) return;
    if (await onScheduleSend(scheduleDate)) setScheduleOpen(false);
  };

  const handleBulkSend = async () => {
    if (!validBulkInterval) return;
    if (await onBulkSend(Math.round(bulkIntervalSeconds * 1_000))) {
      setBulkOpen(false);
    }
  };

  const bulkPrimary = primaryMode === "bulk";
  const hasAlternatives = !bulkPrimary && (allowScheduleSend || allowBulkSend);

  return (
    <>
      <div className="inline-flex">
        <Button
          size="sm"
          className={hasAlternatives ? "rounded-r-none" : undefined}
          onClick={bulkPrimary ? () => setBulkOpen(true) : onSend}
          disabled={disabled}
        >
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : bulkPrimary ? (
            <Users />
          ) : (
            <Send />
          )}
          {bulkPrimary ? "Bulk send" : "Send"}
        </Button>

        {hasAlternatives && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="sm"
                  className="-ml-px rounded-l-none border-l border-primary-foreground/20 px-1.5"
                  disabled={disabled}
                  aria-label="More send options"
                />
              }
            >
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {allowScheduleSend && (
                <DropdownMenuItem onClick={openSchedule}>
                  <CalendarClock />
                  Schedule send
                </DropdownMenuItem>
              )}
              {allowBulkSend && (
                <DropdownMenuItem onClick={() => setBulkOpen(true)}>
                  <Users />
                  Bulk send
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule send</DialogTitle>
            <DialogDescription>
              The message will be queued and sent at the selected local time.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="mail-schedule-time">Send at</Label>
            <Input
              id="mail-schedule-time"
              type="datetime-local"
              min={toDateTimeLocalValue(new Date())}
              value={scheduleTime}
              onChange={(event) => setScheduleTime(event.target.value)}
              aria-invalid={scheduleTime.length > 0 && !validScheduleTime}
            />
            {scheduleTime.length > 0 && !validScheduleTime && (
              <p className="text-xs text-destructive">Select a future time.</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScheduleOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleScheduleSend}
              disabled={disabled || !validScheduleTime}
            >
              {loading ? <Loader2 className="animate-spin" /> : <CalendarClock />}
              Schedule send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk send</DialogTitle>
            <DialogDescription>
              Create one separate email for each To recipient. To recipients are
              not listed together.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-sm font-medium">
              {recipientCount} {recipientCount === 1 ? "recipient" : "recipients"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Scheduled sending is not available for bulk sends.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mail-bulk-interval">Interval between emails (seconds)</Label>
            <Input
              id="mail-bulk-interval"
              type="number"
              min="0.1"
              step="0.1"
              value={bulkIntervalSeconds}
              onChange={(event) => setBulkIntervalSeconds(event.target.valueAsNumber)}
              aria-invalid={!validBulkInterval}
            />
            {!validBulkInterval && (
              <p className="text-xs text-destructive">
                Enter an interval of at least 0.1 seconds.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkSend}
              disabled={disabled || recipientCount < 2 || !validBulkInterval}
            >
              {loading ? <Loader2 className="animate-spin" /> : <Users />}
              Send to {recipientCount}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

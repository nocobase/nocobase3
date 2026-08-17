import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { mailApi } from "./mail-api";
import { MailMassMessageStatus, type MailMassMessage } from "./types";

const ACTIVE_STATUSES = new Set<MailMassMessageStatus>([
  MailMassMessageStatus.PENDING,
  MailMassMessageStatus.SENDING,
]);

export function useMailMassMessages(
  parentId: number | null,
  { enabled = true, pollIntervalMs = 3_000 } = {}
) {
  const [messages, setMessages] = useState<MailMassMessage[]>([]);
  const [loading, setLoading] = useState(enabled);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const response = await mailApi.listMassMessages(parentId);
      if (sequence === requestSequence.current) setMessages(response.rows);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      toast.error(
        error instanceof Error ? error.message : "Failed to load bulk send tasks"
      );
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [enabled, parentId]);

  useEffect(() => {
    if (!enabled) {
      setMessages([]);
      setLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !messages.some((message) => ACTIVE_STATUSES.has(message.status))) {
      return;
    }
    const timer = window.setInterval(() => void refresh(), pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, messages, pollIntervalMs, refresh]);

  return { messages, loading, refresh };
}

import { useEffect, useState } from "react";
import { Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import type { MailMessage, MailNote } from "./types";
import { mailApi } from "./mail-api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function MailNoteEditor({
  message,
  onChange,
}: {
  message: MailMessage;
  onChange?: (note: MailNote | undefined) => void;
}) {
  const note = message.note?.[0];
  const hasNote = Boolean(note?.note);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note?.note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(note?.note ?? "");
  }, [note]);

  const save = async () => {
    setSaving(true);
    try {
      if (note) {
        await mailApi.updateNote(note.id, message.id, draft);
        onChange?.(draft.trim() ? { ...note, note: draft } : undefined);
      } else {
        const created = await mailApi.createNote(message.id, draft);
        onChange?.(created);
      }
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn("text-left", hasNote ? "block w-full" : "inline-flex")}
          />
        }
      >
        {hasNote ? (
          <span className="block w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 transition-colors hover:bg-amber-500/15 dark:border-amber-400/25 dark:bg-amber-400/10 dark:hover:bg-amber-400/15">
            <span className="flex items-start gap-2">
              <StickyNote className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="line-clamp-3 text-xs leading-5 whitespace-pre-wrap text-foreground/90">
                {note?.note}
              </span>
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <StickyNote className="size-3.5" />
            Add note
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-2">
        <div className="px-1 text-xs font-semibold text-muted-foreground">
          {hasNote ? "Edit note" : "Add note"}
        </div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Leave yourself a note about this email…"
          className="min-h-24 text-sm"
          autoFocus
        />
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="xs" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

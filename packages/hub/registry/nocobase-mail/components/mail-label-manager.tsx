import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mailApi } from "./mail-api";
import type { MailLabel } from "./types";
import { LABEL_COLOR_OPTIONS, LABEL_SWATCH_CLASSES } from "./types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type LabelValues = Pick<MailLabel, "label" | "color" | "description">;
const EMPTY: LabelValues = { label: "", color: "default", description: "" };

export interface MailLabelManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: MailLabel[];
  onChange: (labels: MailLabel[]) => void;
  embedded?: boolean;
}

export function MailLabelManager({
  open,
  onOpenChange,
  labels,
  onChange,
  embedded = false,
}: MailLabelManagerProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<LabelValues>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const first = labels[0];
    setSelectedId(first?.id ?? null);
    setForm(
      first
        ? {
            label: first.label,
            color: first.color,
            description: first.description ?? "",
          }
        : EMPTY
    );
    // Initialize once per opening; keep the current edit stable after a mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const select = (label: MailLabel) => {
    setSelectedId(label.id);
    setForm({
      label: label.label,
      color: label.color,
      description: label.description ?? "",
    });
  };

  const save = async () => {
    const name = form.label.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (selectedId === null) {
        const created = await mailApi.createLabel({ ...form, label: name });
        onChange([...labels, created]);
        setSelectedId(created.id);
      } else {
        const updated = await mailApi.updateLabel(selectedId, {
          ...form,
          label: name,
        });
        onChange(
          labels.map((item) =>
            item.id === selectedId ? { ...item, ...updated } : item
          )
        );
      }
      toast.success("Label saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save label"
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (confirmDeleteId === null) return;
    setBusy(true);
    try {
      await mailApi.deleteLabel(confirmDeleteId);
      onChange(labels.filter((item) => item.id !== confirmDeleteId));
      if (selectedId === confirmDeleteId) {
        setSelectedId(null);
        setForm(EMPTY);
      }
      setConfirmDeleteId(null);
      toast.success("Label deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete label"
      );
    } finally {
      setBusy(false);
    }
  };

  const editor = (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
      <div className="flex flex-col gap-2">
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {labels.map((label) => (
            <div
              key={label.id}
              className={cn(
                "group flex items-center rounded-md text-sm hover:bg-muted/60",
                selectedId === label.id && "bg-muted font-medium"
              )}
            >
              <button
                type="button"
                onClick={() => select(label)}
                className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
              >
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    LABEL_SWATCH_CLASSES[label.color] ??
                      LABEL_SWATCH_CLASSES.default
                  )}
                />
                <span className="truncate">{label.label}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                title={`Delete ${label.label}`}
                aria-label={`Delete ${label.label}`}
                disabled={busy}
                onClick={() => setConfirmDeleteId(label.id)}
                className="mr-1 shrink-0 text-muted-foreground opacity-60 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelectedId(null);
            setForm(EMPTY);
          }}
        >
          <Plus /> New
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={form.label}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, label: event.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input
            value={form.description ?? ""}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Color</Label>
          <div className="flex items-center gap-2">
            {LABEL_COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => setForm((prev) => ({ ...prev, color }))}
                className={cn(
                  "size-5 rounded-full",
                  LABEL_SWATCH_CLASSES[color],
                  form.color === color &&
                    "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                )}
              />
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end">
          <Button
            size="sm"
            disabled={!form.label.trim() || busy}
            onClick={() => void save()}
          >
            {busy && <Loader2 className="animate-spin" />} Save
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {embedded ? (
        editor
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Manage labels</DialogTitle>
            </DialogHeader>
            {editor}
          </DialogContent>
        </Dialog>
      )}
      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this label?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the label from every message that uses it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

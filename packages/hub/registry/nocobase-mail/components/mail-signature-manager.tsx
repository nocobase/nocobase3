import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { MailSignature } from "./types";
import type { MailSignatureValues } from "./use-mail-signatures";
import { MailRichEditor } from "./mail-rich-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface MailSignatureManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signatures: MailSignature[];
  onCreate: (values: MailSignatureValues) => Promise<MailSignature>;
  onUpdate: (id: string, values: MailSignatureValues) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
  onSetDefault: (id: string) => Promise<unknown>;
  embedded?: boolean;
}

const EMPTY: MailSignatureValues = { name: "", content: "", isDefault: false };

export function MailSignatureManager({
  open,
  onOpenChange,
  signatures,
  onCreate,
  onUpdate,
  onRemove,
  onSetDefault,
  embedded = false,
}: MailSignatureManagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<MailSignatureValues>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const first = signatures[0];
    if (first) {
      setSelectedId(first.id);
      setForm({
        name: first.name,
        content: first.content,
        isDefault: Boolean(first.isDefault),
      });
    } else {
      setSelectedId(null);
      setForm(EMPTY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectSignature = (signature: MailSignature) => {
    setSelectedId(signature.id);
    setForm({
      name: signature.name,
      content: signature.content,
      isDefault: Boolean(signature.isDefault),
    });
  };

  const startNew = () => {
    setSelectedId(null);
    setForm(EMPTY);
  };

  const canSave = form.name.trim().length > 0;
  const selectedIsDefault = signatures.find(
    (signature) => signature.id === selectedId
  )?.isDefault;

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (selectedId) await onUpdate(selectedId, form);
      else setSelectedId((await onCreate(form)).id);
      toast.success("Signature saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save signature"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    try {
      await onRemove(id);
      if (selectedId === id) {
        setSelectedId(null);
        setForm(EMPTY);
      }
      toast.success("Signature deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete signature"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSetDefault = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await onSetDefault(selectedId);
      setForm((prev) => ({ ...prev, isDefault: !selectedIsDefault }));
      toast.success(
        selectedIsDefault
          ? "Default signature cleared"
          : "Default signature set"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update default signature"
      );
    } finally {
      setBusy(false);
    }
  };

  const editor = (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
      <div className="flex flex-col gap-2">
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {signatures.map((signature) => (
            <div
              key={signature.id}
              className={cn(
                "group flex items-center rounded-md text-sm transition-colors",
                selectedId === signature.id
                  ? "bg-muted font-medium"
                  : "hover:bg-muted/50"
              )}
            >
              <button
                type="button"
                onClick={() => selectSignature(signature)}
                className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate">{signature.name}</span>
                {signature.isDefault && (
                  <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                )}
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                title={`Delete ${signature.name}`}
                aria-label={`Delete ${signature.name}`}
                disabled={busy}
                onClick={() => void handleDelete(signature.id)}
                className="mr-1 shrink-0 text-muted-foreground opacity-60 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          {!signatures.length && (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">
              No signatures yet
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={startNew}>
          <Plus />
          New
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Name</Label>
          <Input
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="e.g. Work"
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Content</Label>
          <MailRichEditor
            value={form.content}
            onChange={(content) => setForm((prev) => ({ ...prev, content }))}
            placeholder="Signature content…"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(form.isDefault)}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, isDefault: e.target.checked }))
            }
            className="size-4 accent-primary"
          />
          Default signature (auto-insert on new messages)
        </label>

        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            {selectedId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleSetDefault()}
                disabled={busy}
              >
                <Star />
                {selectedIsDefault ? "Unset default" : "Set default"}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={!canSave || busy}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) return editor;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Signatures</DialogTitle>
        </DialogHeader>
        {editor}
      </DialogContent>
    </Dialog>
  );
}

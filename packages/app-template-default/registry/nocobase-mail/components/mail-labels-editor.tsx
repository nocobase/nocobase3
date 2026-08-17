import { useEffect, useRef, useState } from "react";
import { useGetIdentity } from "@refinedev/core";
import { Check, Loader2, Plus, Settings2, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import type { MailLabel, MailMessage } from "./types";
import { LABEL_COLOR_OPTIONS, LABEL_SWATCH_CLASSES } from "./types";
import { mailApi } from "./mail-api";
import { MailLabelBadge } from "./mail-label-badge";
import { MailLabelManager } from "./mail-label-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function MailLabelsEditor({
  message,
  onChange,
}: {
  message: MailMessage;
  onChange?: (labels: MailLabel[]) => void;
}) {
  const { data: identity } = useGetIdentity<{ id: number | string }>();
  const userId = identity?.id;
  const [open, setOpen] = useState(false);
  const [allLabels, setAllLabels] = useState<MailLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>(
    message.labels?.map((l) => l.id) ?? []
  );
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<string>("default");
  const [creating, setCreating] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const commitQueue = useRef<Promise<unknown>>(Promise.resolve());
  const commitSequence = useRef(0);

  useEffect(() => {
    setSelectedIds(message.labels?.map((l) => l.id) ?? []);
  }, [message.labels]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    mailApi
      .getLabels(userId)
      .then((labels) => active && setAllLabels(labels))
      .catch(() => active && setAllLabels([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, userId]);

  const resolveLabels = (ids: number[], from?: MailLabel[]): MailLabel[] => {
    const source = from ?? allLabels;
    return ids
      .map(
        (id) =>
          source.find((l) => l.id === id) ??
          message.labels?.find((l) => l.id === id)
      )
      .filter((l): l is MailLabel => Boolean(l));
  };

  const commit = (
    ids: number[],
    from?: MailLabel[],
    rollbackIds = selectedIds
  ) => {
    const sequence = ++commitSequence.current;
    const request = commitQueue.current
      .catch(() => undefined)
      .then(() => mailApi.setMessageLabels(message.id, ids));
    commitQueue.current = request;
    return request
      .then(() => {
        if (sequence === commitSequence.current) {
          onChange?.(resolveLabels(ids, from));
        }
      })
      .catch((error) => {
        if (sequence === commitSequence.current) {
          setSelectedIds(rollbackIds);
          onChange?.(resolveLabels(rollbackIds, from));
          toast.error(
            error instanceof Error ? error.message : "Failed to update labels"
          );
        }
      });
  };

  const toggle = (id: number) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    setSelectedIds(next);
    void commit(next, undefined, selectedIds);
  };

  const createLabel = async () => {
    const name = newLabel.trim();
    if (!name) return;
    setCreating(true);
    try {
      const label = await mailApi.createLabel({ label: name, color: newColor });
      const updatedAll = [...allLabels, label];
      setAllLabels(updatedAll);
      const next = [...selectedIds, label.id];
      setSelectedIds(next);
      await commit(next, updatedAll);
      setNewLabel("");
      setNewColor("default");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create label"
      );
    } finally {
      setCreating(false);
    }
  };

  const handleLabelsManaged = (labels: MailLabel[]) => {
    setAllLabels(labels);
    const validIds = selectedIds.filter((id) => labels.some((label) => label.id === id));
    if (validIds.length !== selectedIds.length) {
      setSelectedIds(validIds);
      void commit(validIds, labels, selectedIds);
    } else {
      onChange?.(resolveLabels(validIds, labels));
    }
  };

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex flex-wrap items-center gap-1.5 rounded-md py-0.5 transition-opacity hover:opacity-80"
          />
        }
      >
        {message.labels?.length ? (
          message.labels.map((label) => (
            <MailLabelBadge key={label.id} label={label} />
          ))
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <TagIcon className="size-3" />
            Add label
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-2">
        <div className="px-1 text-xs font-semibold text-muted-foreground">
          Labels
        </div>
        <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : allLabels.length ? (
            allLabels.map((label) => {
              const checked = selectedIds.includes(label.id);
              return (
                <div
                  key={label.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(label.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(label.id);
                    }
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60",
                    checked && "bg-muted/40"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input"
                    )}
                  >
                    {checked && <Check className="size-3" />}
                  </span>
                  <MailLabelBadge label={label} />
                </div>
              );
            })
          ) : (
            <div className="py-3 text-center text-xs text-muted-foreground">
              No labels yet
            </div>
          )}
        </div>
        <div className="border-t border-border/60 pt-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            {LABEL_COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => setNewColor(color)}
                className={cn(
                  "size-4 rounded-full transition-all",
                  LABEL_SWATCH_CLASSES[color],
                  newColor === color
                    ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                    : "hover:scale-110"
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createLabel();
                }
              }}
              placeholder="New label…"
              className="h-8 text-sm"
            />
            <Button
              size="icon-sm"
              onClick={() => void createLabel()}
              disabled={creating || !newLabel.trim()}
            >
              {creating ? <Loader2 className="animate-spin" /> : <Plus />}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start"
            onClick={() => { setOpen(false); setManagerOpen(true); }}
          >
            <Settings2 /> Manage labels
          </Button>
        </div>
      </PopoverContent>
    </Popover>
    <MailLabelManager
      open={managerOpen}
      onOpenChange={setManagerOpen}
      labels={allLabels}
      onChange={handleLabelsManaged}
    />
    </>
  );
}

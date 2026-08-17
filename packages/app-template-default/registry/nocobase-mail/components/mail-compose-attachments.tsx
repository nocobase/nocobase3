import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Paperclip, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { mailApi } from "./mail-api";
import type { MailUploadedAttachment } from "./types";
import { Button } from "@/components/ui/button";

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

interface AttachmentRow {
  id: string;
  name: string;
  status: "uploading" | "done" | "error";
  file?: File;
  uploaded?: MailUploadedAttachment;
}

function attachmentId() {
  return `attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface MailComposeAttachmentsProps {
  value: MailUploadedAttachment[];
  onChange: (value: MailUploadedAttachment[]) => void;
  onBusyChange?: (busy: boolean) => void;
  onDirty?: () => void;
  disabled?: boolean;
}

export function MailComposeAttachments({
  value,
  onChange,
  onBusyChange,
  onDirty,
  disabled,
}: MailComposeAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onBusyChangeRef = useRef(onBusyChange);
  const [rows, setRows] = useState<AttachmentRow[]>(() =>
    value.map((attachment) => ({
      id: attachmentId(),
      name: attachment.originalname,
      status: "done",
      uploaded: attachment,
    }))
  );

  useEffect(() => {
    onChangeRef.current = onChange;
    onBusyChangeRef.current = onBusyChange;
  }, [onChange, onBusyChange]);

  useEffect(() => {
    onChangeRef.current(
      rows.flatMap((row) =>
        row.status === "done" && row.uploaded ? [row.uploaded] : []
      )
    );
    onBusyChangeRef.current?.(rows.some((row) => row.status !== "done"));
  }, [rows]);

  const upload = async (id: string, file: File) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, status: "uploading", file } : row
      )
    );
    try {
      const uploaded = await mailApi.uploadAttachment(file);
      setRows((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, status: "done", uploaded } : row
        )
      );
    } catch (error) {
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, status: "error" } : row))
      );
      toast.error(
        error instanceof Error ? error.message : `${file.name} upload failed`
      );
    }
  };

  const addFiles = (files: File[]) => {
    const accepted = files.filter((file) => {
      if (file.size <= MAX_ATTACHMENT_SIZE) return true;
      toast.error(`${file.name} exceeds the 25 MB attachment limit`);
      return false;
    });
    const additions = accepted.map((file) => ({
      id: attachmentId(),
      name: file.name,
      status: "uploading" as const,
      file,
    }));
    if (additions.length) onDirty?.();
    setRows((prev) => [...prev, ...additions]);
    additions.forEach((row) => void upload(row.id, row.file));
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) addFiles(Array.from(event.target.files));
          event.target.value = "";
        }}
      />
      {rows.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-2">
          {rows.map((row) => (
            <span
              key={row.id}
              className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border/80 bg-muted/50 px-2 py-1 text-xs"
            >
              {row.status === "uploading" ? (
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              ) : row.status === "error" ? (
                <AlertCircle className="size-3 text-destructive" />
              ) : (
                <Paperclip className="size-3 text-muted-foreground" />
              )}
              <span className="min-w-0 max-w-52 truncate">{row.name}</span>
              {row.status === "error" && row.file && (
                <button
                  type="button"
                  title="Retry upload"
                  onClick={() => void upload(row.id, row.file!)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="size-3" />
                </button>
              )}
              <button
                type="button"
                title="Remove attachment"
                onClick={() => {
                  onDirty?.();
                  setRows((prev) => prev.filter((item) => item.id !== row.id));
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        title="Attach files"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip />
      </Button>
    </div>
  );
}

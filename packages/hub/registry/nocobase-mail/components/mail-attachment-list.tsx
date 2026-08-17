import { Download, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import type { MailAttachment } from "./types";
import { mailApi } from "./mail-api";
import { cn } from "@/lib/utils";

function formatSize(size?: number) {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

export function MailAttachmentList({
  messageId,
  attachments,
  className,
}: {
  messageId: number | string;
  attachments: MailAttachment[];
  className?: string;
}) {
  if (!attachments?.length) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Paperclip className="size-3.5" />
        {attachments.length} attachment{attachments.length > 1 ? "s" : ""}
      </div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => (
          <a
            key={att.attachmentId}
            href={mailApi.attachmentUrl(messageId, att.attachmentId)}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "group flex items-center gap-2.5 rounded-lg border border-border/80 bg-card px-3 py-2",
              "shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-primary/40 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            )}
          >
            {isImage(att.mimeType) ? (
              <ImageIcon className="size-4 shrink-0 text-sky-500" />
            ) : (
              <FileText className="size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className="max-w-[180px] truncate text-xs font-medium text-foreground">
                {att.filename}
              </div>
              {att.size ? (
                <div className="text-[10px] text-muted-foreground">
                  {formatSize(att.size)}
                </div>
              ) : null}
            </div>
            <Download className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { ExternalLink, FileDown, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createFilesClient, type FileObject, type FilesClient } from "@nocobase/portal-sdk/files";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { canInline, type FilePreviewProps } from "./types";

const defaultClient = createFilesClient({ client: nocobaseClient });
export function FilePreview({ file, className, mode = "compact", expiresIn, client = defaultClient, onOpenChange }: FilePreviewProps) {
  const [metadata, setMetadata] = useState<FileObject | undefined>("fileId" in file ? undefined : file);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const id = "fileId" in file ? file.fileId : String(file.id);
  const setOpenState = (next: boolean) => { setOpen(next); onOpenChange?.(next); if (!next) { setUrl(undefined); setError(undefined); } };
  useEffect(() => { if (!open) return; const controller = new AbortController(); let refreshTimer: number | undefined; void (async () => {
    try {
      const current = metadata ?? await client.get(id, { signal: controller.signal });
      if (!metadata) setMetadata(current);
      if (canInline(current.contentType) || current.contentType.startsWith("audio/") || current.contentType.startsWith("video/")) {
        const result = await client.createUrl(id, { disposition: "inline", expiresIn, signal: controller.signal });
        if (!controller.signal.aborted) {
          setUrl(result.url);
          const delay = Date.parse(result.expiresAt) - Date.now() - 30_000;
          if (Number.isFinite(delay)) refreshTimer = window.setTimeout(() => setRefresh((value) => value + 1), Math.max(1_000, delay));
        }
      }
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Preview unavailable"); }
  })(); return () => { controller.abort(); if (refreshTimer !== undefined) window.clearTimeout(refreshTimer); }; }, [client, expiresIn, id, metadata, open, refresh]);
  const openUrl = async (disposition: "inline" | "attachment") => { try { const result = await client.createUrl(id, { disposition, expiresIn }); window.open(result.url, "_blank", "noopener,noreferrer"); } catch (cause) { setError(cause instanceof Error ? cause.message : "File unavailable"); } };
  const type = metadata?.contentType ?? "application/octet-stream";
  return <div className={cn("space-y-2", className)}><Button type="button" variant="outline" onClick={() => setOpenState(true)} aria-label={`Open ${metadata?.originalName ?? id}`}><ExternalLink />{mode === "full" ? metadata?.originalName ?? id : "Preview"}</Button>{open ? <div role="dialog" aria-label="File preview" className="space-y-2 rounded-md border p-3"><div className="text-sm">{metadata?.originalName ?? id}</div>{error ? <div role="alert" className="text-destructive">{error}<Button type="button" size="sm" variant="ghost" onClick={() => { setError(undefined); setOpen(false); queueMicrotask(() => setOpen(true)); }}><RotateCw />Retry</Button></div> : !metadata ? <Loader2 className="animate-spin" /> : canInline(type) && url ? <img src={url} alt={metadata.originalName} className="max-h-96 max-w-full object-contain" /> : type.startsWith("audio/") && url ? <audio controls src={url} /> : type.startsWith("video/") && url ? <video controls src={url} className="max-h-96 max-w-full" /> : <div className="text-sm text-muted-foreground">Preview is unavailable for {type}. Use open or download.</div>}<div className="flex gap-2"><Button type="button" variant="outline" onClick={() => void openUrl("inline")}><ExternalLink />Open</Button><Button type="button" variant="outline" onClick={() => void openUrl("attachment")}><FileDown />Download</Button><Button type="button" variant="ghost" onClick={() => setOpenState(false)}>Close</Button></div></div> : null}</div>;
}

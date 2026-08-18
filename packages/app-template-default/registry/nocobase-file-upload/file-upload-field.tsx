import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFileUpload } from "./use-file-upload";
import type { FileUploadProps } from "./types";

export function FileUpload({ className, ...props }: FileUploadProps & { className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { items, addFiles, remove, abort, multiple, reachedLimit } = useFileUpload(props);
  const files = props.value ?? [];
  return <div className={cn("space-y-3", className)} aria-busy={items.some((item) => item.status === "uploading" || item.status === "preparing")}>
    <div className="flex flex-wrap gap-2">
      {files.map((file) => <div className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm" key={String(file.id)}><span className="max-w-48 truncate">{file.originalName}</span><Button type="button" size="icon-sm" variant="ghost" aria-label="Remove file" onClick={() => void remove(String(file.id))}><Trash2 /></Button></div>)}
      {items.filter((item) => item.status !== "success").map((item) => <div className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm" key={item.key}><span className="max-w-48 truncate">{item.file.name}</span>{item.status === "error" ? <span className="text-destructive">{item.error?.message}</span> : item.status === "aborted" ? <span>Aborted</span> : <Loader2 className="size-4 animate-spin" />}{item.status === "uploading" || item.status === "preparing" ? <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel upload" onClick={() => abort(item.key)}><X /></Button> : null}</div>)}
      {!props.disabled && !reachedLimit ? <Button type="button" variant="outline" onClick={() => input.current?.click()}><Plus />{multiple ? "Choose files" : "Choose file"}</Button> : null}
      <input ref={input} className="sr-only" type="file" multiple={multiple} accept={props.accept?.join(",")} disabled={props.disabled || reachedLimit} onChange={(event) => { if (event.currentTarget.files) void addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
    </div>
  </div>;
}
export const FileUploadField = FileUpload;

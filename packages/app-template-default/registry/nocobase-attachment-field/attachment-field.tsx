import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/extensions/nocobase-file-upload";
import { FilePreview } from "@/extensions/nocobase-file-preview";
import { createFilesClient, type FileAccessContext, type FileObject, type FilesClient } from "@nocobase/portal-sdk/files";
import { nocobaseClient } from "@nocobase/portal-sdk/client";

export type AttachmentFieldProps = { value?: string[]; onChange?: (fileIds: string[]) => void; policy?: string; context?: FileAccessContext; multiple?: boolean; maxFiles?: number; disabled?: boolean; deleteFileOnRemove?: boolean; client?: FilesClient };
const defaultClient = createFilesClient({ client: nocobaseClient });
const emptyIds: string[] = [];

export function AttachmentField({ value = emptyIds, onChange, policy = "attachment", context, multiple = true, maxFiles, disabled, deleteFileOnRemove = false, client = defaultClient }: AttachmentFieldProps) {
  const [files, setFiles] = useState<FileObject[]>([]);
  useEffect(() => { const controller = new AbortController(); void Promise.all(value.map(async (id) => { try { return await client.get(id, { signal: controller.signal }); } catch { return { id, policy, originalName: "Unavailable file", contentType: "application/octet-stream", size: 0, status: "failed", createdAt: "", updatedAt: "" } as FileObject; } })).then((next) => { if (!controller.signal.aborted) setFiles(next); }); return () => controller.abort(); }, [client, policy, value]);
  const update = (next: FileObject[]) => onChange?.(next.map((file) => String(file.id)));
  const remove = async (file: FileObject) => { if (deleteFileOnRemove) await client.remove(String(file.id)); update(files.filter((entry) => String(entry.id) !== String(file.id))); };
  return <div className="space-y-3"><FileUpload policy={policy} context={context} value={files} onChange={update} multiple={multiple} maxFiles={maxFiles} disabled={disabled} deleteOnRemove={deleteFileOnRemove} client={client} /><div className="space-y-2">{files.map((file) => <div key={String(file.id)} className="flex items-center gap-2"><FilePreview file={file} client={client} mode="full" /><Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Remove ${file.originalName}`} onClick={() => void remove(file)}><X /></Button></div>)}</div></div>;
}

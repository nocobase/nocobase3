import { useEffect, useState, type ComponentProps } from "react";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { createFilesClient, type FileObject } from "@nocobase/portal-sdk/files";
import { isUnsafeInlineFile } from "./file-preview-types";
const files = createFilesClient({ client: nocobaseClient });
export type FilePreviewFieldProps = Omit<ComponentProps<"div">, "children"> & { value?: FileObject[]; size?: number; showFileName?: boolean };
export function FilePreviewField({ value = [], size = 80, showFileName, ...props }: FilePreviewFieldProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => { const controller = new AbortController(); void Promise.all(value.filter((file) => file.contentType.startsWith("image/") && !isUnsafeInlineFile(file)).map(async (file) => { try { const result = await files.createUrl(String(file.id), { disposition: "inline", signal: controller.signal }); setUrls((current) => ({ ...current, [String(file.id)]: result.url })); } catch { /* optional preview */ } })); return () => controller.abort(); }, [value]);
  return <div className="flex flex-wrap gap-3" {...props}>{value.map((file) => <div key={String(file.id)} style={{ width: size }}><div className="flex items-center justify-center overflow-hidden rounded-md border" style={{ width: size, height: size }}>{urls[String(file.id)] && !isUnsafeInlineFile(file) ? <img src={urls[String(file.id)]} alt={file.originalName} className="size-full object-cover" /> : <span className="p-2 text-xs text-muted-foreground">{file.contentType}</span>}</div>{showFileName ? <span className="block truncate text-center text-xs">{file.originalName}</span> : null}</div>)}</div>;
}

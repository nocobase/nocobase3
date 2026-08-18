import { FileIcon } from "lucide-react";
import type { FileObject } from "@nocobase/portal-sdk/files";
export function FileThumbnail({ alt }: { file?: FileObject; alt?: string }) { return <span title={alt} aria-label={alt}><FileIcon className="size-6 text-muted-foreground" /></span>; }

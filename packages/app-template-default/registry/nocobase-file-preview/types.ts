import type { FileAccessContext, FileObject, FilesClient } from "@nocobase/portal-sdk/files";

export type PreviewFile = FileObject | { fileId: string };
export type FilePreviewProps = {
  file: PreviewFile;
  className?: string;
  mode?: "compact" | "full";
  expiresIn?: number;
  policy?: string;
  context?: FileAccessContext;
  client?: FilesClient;
  onOpenChange?: (open: boolean) => void;
};

export const inlineImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const canInline = (contentType: string) => inlineImageTypes.has(contentType);
export const previewBehavior = (contentType: string) => canInline(contentType) ? "image" : contentType.startsWith("audio/") ? "audio" : contentType.startsWith("video/") ? "video" : "action";

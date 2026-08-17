import { getFileName, getPreviewFileUrl } from "../file-url";
import type { FilePreviewerProps } from "../file-preview-types";

export function ImagePreviewer({ file, messages }: FilePreviewerProps) {
  const filename = getFileName(file);

  return (
    <div className="flex h-full min-h-[320px] items-center justify-center bg-muted/30 p-4">
      <img
        src={getPreviewFileUrl(file)}
        alt={messages.imageAlt(filename)}
        className="max-h-full max-w-full rounded-md object-contain"
      />
    </div>
  );
}

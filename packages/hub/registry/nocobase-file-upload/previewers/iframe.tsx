import { FileAudio, FileVideo } from "lucide-react";
import type { ReactNode } from "react";

import { getPreviewFileUrl } from "../file-url";
import type { FilePreviewerProps } from "../file-preview-types";

function PreviewLabel({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-medium">
      {icon}
      {label}
    </div>
  );
}

export function AudioPreviewer({ file, messages }: FilePreviewerProps) {
  return (
    <div className="flex h-full min-h-[320px] flex-col bg-background">
      <PreviewLabel icon={<FileAudio className="size-4" />} label={messages.audioTitle} />
      <div className="flex flex-1 items-center justify-center p-6">
        <audio controls src={getPreviewFileUrl(file)} className="w-full max-w-xl" />
      </div>
    </div>
  );
}

export function VideoPreviewer({ file, messages }: FilePreviewerProps) {
  return (
    <div className="flex h-full min-h-[420px] flex-col bg-background">
      <PreviewLabel icon={<FileVideo className="size-4" />} label={messages.videoTitle} />
      <div className="flex flex-1 items-center justify-center bg-black">
        <video controls src={getPreviewFileUrl(file)} className="max-h-full max-w-full" />
      </div>
    </div>
  );
}

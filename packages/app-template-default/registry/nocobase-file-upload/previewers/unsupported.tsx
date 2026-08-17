import { Download } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { getFileName } from "../file-url";
import type { FilePreviewerProps } from "../file-preview-types";

export function UnsupportedPreviewer({
  file,
  messages,
  onDownload,
}: FilePreviewerProps) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-6">
      <Alert className="max-w-md">
        <AlertDescription className="space-y-4">
          <div>
            <p className="font-medium text-foreground">
              {messages.unsupportedTitle}
            </p>
            <p className="mt-1 text-muted-foreground">
              {messages.unsupportedDescription}
            </p>
            <p className="mt-2 break-all text-xs text-muted-foreground">
              {getFileName(file)}
            </p>
          </div>
          <Button type="button" onClick={() => onDownload(file)}>
            <Download />
            {messages.download}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

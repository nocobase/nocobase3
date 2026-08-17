import { Download, FileWarning, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { createTemporaryFileUrl, getPreviewFileUrl } from "../file-url";
import type { FilePreviewerProps } from "../file-preview-types";

function buildOfficeViewerUrl(fileUrl: string) {
  const url = new URL("https://view.officeapps.live.com/op/embed.aspx");
  url.searchParams.set("src", fileUrl);
  return url.toString();
}

export function OfficePreviewer({
  file,
  descriptor,
  messages,
  onDownload,
}: FilePreviewerProps) {
  const canCreateTemporaryUrl = Boolean(
    descriptor && file.id != null && file.storageId != null
  );
  const [temporaryUrl, setTemporaryUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingTemporaryUrl, setLoadingTemporaryUrl] = useState(
    canCreateTemporaryUrl
  );

  useEffect(() => {
    let cancelled = false;

    if (!canCreateTemporaryUrl || !descriptor) {
      setLoadingTemporaryUrl(false);
      setTemporaryUrl(null);
      setFailed(false);
      return;
    }

    setLoadingTemporaryUrl(true);
    setFailed(false);
    createTemporaryFileUrl(file, descriptor)
      .then((url) => {
        if (cancelled) return;
        if (url) setTemporaryUrl(url);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingTemporaryUrl(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canCreateTemporaryUrl, descriptor, file]);

  const officeUrl = useMemo(() => {
    const fileUrl = temporaryUrl || getPreviewFileUrl(file);
    return fileUrl ? buildOfficeViewerUrl(fileUrl) : "";
  }, [file, temporaryUrl]);

  if (loadingTemporaryUrl) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {messages.officeLoading}
      </div>
    );
  }

  if (failed || !officeUrl) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center p-6">
        <Alert className="max-w-md">
          <FileWarning className="size-4" />
          <AlertDescription className="space-y-4">
            <div>
              <p className="font-medium text-foreground">
                {messages.officeError}
              </p>
              <p className="mt-1 text-muted-foreground">
                {messages.unsupportedDescription}
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

  return (
    <iframe
      src={officeUrl}
      title={messages.officeTitle}
      className="h-full min-h-[520px] w-full bg-background"
      onError={() => setFailed(true)}
    />
  );
}

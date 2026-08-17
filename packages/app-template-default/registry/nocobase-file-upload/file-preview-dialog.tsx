import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { getFileName, triggerFileDownload } from "./file-url";
import { defaultFilePreviewMessages } from "./file-preview-messages";
import { getPreviewType } from "./file-preview-types";
import type {
  FileFieldDescriptor,
  FilePreviewMessages,
  NocoBaseFileRecord,
} from "./types";

export type FilePreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: NocoBaseFileRecord[];
  initialIndex?: number;
  descriptor?: FileFieldDescriptor;
  messages?: Partial<FilePreviewMessages>;
};

export function FilePreviewDialog({
  open,
  onOpenChange,
  files,
  initialIndex = 0,
  descriptor,
  messages: messageOverrides,
}: FilePreviewDialogProps) {
  const [index, setIndex] = useState(initialIndex);
  const messages = useMemo(
    () => ({ ...defaultFilePreviewMessages, ...messageOverrides }),
    [messageOverrides]
  );

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [initialIndex, open]);

  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, files.length - 1)));
  }, [files.length]);

  const file = files[index] ?? files[0];
  const previewType = useMemo(() => (file ? getPreviewType(file) : null), [file]);

  if (!file || !previewType) return null;

  const Previewer = previewType.Previewer;
  const canGoPrevious = files.length > 1 && index > 0;
  const canGoNext = files.length > 1 && index < files.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-file-preview-dialog=""
        className="max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <DialogHeader className="border-b px-4 py-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate">{getFileName(file)}</DialogTitle>
              <DialogDescription>
                {files.length > 1
                  ? `${index + 1} / ${files.length}`
                  : messages.preview}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {files.length > 1 ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={messages.previous}
                    title={messages.previous}
                    disabled={!canGoPrevious}
                    onClick={() =>
                      setIndex((current) => Math.max(0, current - 1))
                    }
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={messages.next}
                    title={messages.next}
                    disabled={!canGoNext}
                    onClick={() =>
                      setIndex((current) =>
                        Math.min(files.length - 1, current + 1)
                      )
                    }
                  >
                    <ChevronRight />
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={messages.download}
                title={messages.download}
                onClick={() => triggerFileDownload(file)}
              >
                <Download />
              </Button>
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={messages.close}
                    title={messages.close}
                  />
                }
              >
                <X />
              </DialogClose>
            </div>
          </div>
        </DialogHeader>
        <div className="h-[min(70vh,720px)] overflow-hidden">
          <Previewer
            file={file}
            index={index}
            list={files}
            descriptor={descriptor}
            messages={messages}
            onDownload={triggerFileDownload}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

import {
  AlertCircle,
  Check,
  CircleX,
  Loader2,
  Plus,
  Trash2,
  RotateCcw,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState, type ComponentProps } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  useRegisterFieldValidationController,
  type FieldValidationController,
} from "@/lib/field-validation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { FilePreviewDialog } from "./file-preview-dialog";
import { defaultFilePreviewMessages } from "./file-preview-messages";
import { getFileName } from "./file-url";
import { FileThumbnail } from "./file-thumbnail";
import { useFileUpload } from "./use-file-upload";
import { getAcceptAttribute } from "./validation";
import type {
  FileFieldDescriptor,
  FileUploadFieldValue,
  FileUploadHandler,
  FileUploadItem,
  FileUploadMessages,
  FileUploadMode,
  FilePreviewMessages,
  NocoBaseFileRecord,
} from "./types";

export type FileUploadFieldProps = Omit<ComponentProps<"div">, "onChange"> & {
  descriptor: FileFieldDescriptor;
  value: FileUploadFieldValue;
  onChange: (value: FileUploadFieldValue) => void;
  disabled?: boolean;
  readOnly?: boolean;
  maxFiles?: number;
  uploadMode?: FileUploadMode;
  uploadFile?: FileUploadHandler;
  showRemoveTooltip?: boolean;
  messages?: Partial<FileUploadMessages>;
  previewMessages?: Partial<FilePreviewMessages>;
  onUploadStart?: (file: File) => void;
  onUploadComplete?: (record: NocoBaseFileRecord, file: File) => void;
  onUploadError?: (error: Error, file: File) => void;
};

const defaultMessages: FileUploadMessages = {
  chooseFiles: "Choose files",
  chooseFile: "Choose file",
  dragActive: "Drop files here",
  dragInactive: "Drag files here, or choose from your device.",
  checkingStorage: "Checking upload settings",
  uploading: "Uploading",
  uploaded: "Uploaded",
  failed: "Failed",
  cancelled: "Cancelled",
  retry: "Retry",
  remove: "Remove",
  cancel: "Cancel",
  storageUnsupported: "This field is not connected to a file collection.",
  maxFilesReached: "The file limit has been reached.",
  uploadDisabled: "File upload is disabled.",
  noFiles: "No files",
  fileSizeExceeded: (maxSize) => `File size exceeds ${formatFileSize(maxSize)}.`,
  storageMimeTypeRejected: "File type is not allowed by storage.",
  fieldMimeTypeRejected: "File type is not allowed for this field.",
  directUploadFailed: (status) => `Direct upload failed (${status}).`,
  uploadInProgress: "Wait for all files to finish uploading.",
  uploadFailedValidation: "Retry or remove files that failed to upload.",
};

function formatFileSize(size?: number) {
  if (size === undefined) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getStatusLabel(item: FileUploadItem, messages: FileUploadMessages) {
  if (item.status === "checking") return messages.checkingStorage;
  if (item.status === "pending" || item.status === "uploading") {
    return messages.uploading;
  }
  if (item.status === "done") return messages.uploaded;
  if (item.status === "cancelled") return messages.cancelled;
  return messages.failed;
}

function UploadStatusIcon({
  item,
  messages,
}: {
  item: FileUploadItem;
  messages: FileUploadMessages;
}) {
  const label = getStatusLabel(item, messages);
  const iconClassName = "size-3.5";
  const isPending =
    item.status === "pending" ||
    item.status === "checking" ||
    item.status === "uploading";

  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full border shadow-sm",
        item.status === "done" &&
          "border-green-600/20 bg-green-600 text-white",
        item.status === "error" &&
          "border-destructive/20 bg-destructive text-destructive-foreground",
        item.status === "cancelled" &&
          "border-muted-foreground/20 bg-muted text-muted-foreground",
        isPending && "border-primary/20 bg-primary text-primary-foreground"
      )}
    >
      {item.status === "done" ? (
        <Check className={iconClassName} />
      ) : item.status === "error" ? (
        <AlertCircle className={iconClassName} />
      ) : item.status === "cancelled" ? (
        <CircleX className={iconClassName} />
      ) : (
        <Loader2 className={cn(iconClassName, "animate-spin")} />
      )}
    </span>
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  showTooltip = true,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  showTooltip?: boolean;
}) {
  if (!showTooltip) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className="size-6 border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-background hover:text-foreground"
      >
        <Icon />
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
            className="size-6 border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-background hover:text-foreground"
          />
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function FileUploadField({
  descriptor,
  value,
  onChange,
  disabled,
  readOnly,
  maxFiles,
  uploadMode,
  uploadFile,
  showRemoveTooltip = true,
  className,
  messages: messageOverrides,
  previewMessages: previewMessageOverrides,
  onUploadStart,
  onUploadComplete,
  onUploadError,
  ...rootProps
}: FileUploadFieldProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const messages = useMemo(
    () => ({ ...defaultMessages, ...messageOverrides }),
    [messageOverrides]
  );
  const previewMessages = useMemo(
    () => ({
      ...defaultFilePreviewMessages,
      noFiles: messages.noFiles,
      ...previewMessageOverrides,
    }),
    [messages.noFiles, previewMessageOverrides]
  );
  const {
    items,
    addFiles,
    removeItem,
    cancelItem,
    retryItem,
    storageError,
    canUpload,
    multiple,
    reachedLimit,
  } = useFileUpload({
    descriptor,
    value,
    onChange,
    disabled,
    readOnly,
    maxFiles,
    uploadMode,
    uploadFile,
    messages,
    onUploadStart,
    onUploadComplete,
    onUploadError,
  });
  const validationItemsRef = useRef(items);
  const validationMessagesRef = useRef(messages);
  validationItemsRef.current = items;
  validationMessagesRef.current = messages;
  const validationController = useMemo<FieldValidationController>(
    () => ({
      validate: () => {
        const validationItems = validationItemsRef.current;
        if (
          validationItems.some(
            (item) =>
              item.status === "pending" ||
              item.status === "checking" ||
              item.status === "uploading"
          )
        ) {
          return validationMessagesRef.current.uploadInProgress;
        }
        if (validationItems.some((item) => item.status === "error")) {
          return validationMessagesRef.current.uploadFailedValidation;
        }
        return true;
      },
    }),
    []
  );
  useRegisterFieldValidationController(validationController);
  const uploadDisabled = !canUpload || reachedLimit;
  const selectable = !readOnly && !uploadDisabled;
  const previewableFiles = useMemo(
    () =>
      items
        .filter((item) => item.status === "done" && item.record)
        .map((item) => item.record!),
    [items]
  );

  const handleSelectedFiles = (fileList: FileList | null) => {
    if (!fileList?.length || uploadDisabled) return;
    void addFiles(fileList);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (uploadDisabled) return;
    void addFiles(event.dataTransfer.files);
  };

  return (
    <div
      data-slot="file-upload-field"
      className={cn("space-y-3", className)}
      aria-busy={
        items.some(
          (item) => item.status === "checking" || item.status === "uploading"
        ) || undefined
      }
      {...rootProps}
    >
      {storageError ? (
        <Alert variant="destructive">
          <AlertDescription>{storageError.message}</AlertDescription>
        </Alert>
      ) : null}

      <TooltipProvider>
        <div
          className={cn(
            "flex flex-wrap items-start gap-3",
            readOnly && !items.length && "hidden"
          )}
        >
          {items.map((item) => {
            const itemPreviewIndex = item.record
              ? previewableFiles.findIndex(
                  (file) => String(file.id) === String(item.record?.id)
                )
              : -1;
            const canPreview = item.status === "done" && itemPreviewIndex >= 0;
            const canCancel =
              item.status === "checking" || item.status === "uploading";
            const filename = item.record
              ? getFileName(item.record)
              : item.displayName;

            return (
              <div key={item.key} className="w-[104px]">
                <div
                  className={cn(
                    "group relative flex h-[104px] w-[104px] items-center justify-center overflow-hidden rounded-lg border bg-card p-1 transition-colors",
                    item.status === "error" && "border-destructive",
                    canPreview && "hover:border-primary"
                  )}
                >
                  {item.status === "uploading" || item.status === "checking" ? (
                    <div className="flex size-full items-center justify-center rounded-md bg-muted/40">
                      <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <FileThumbnail
                      file={item.record}
                      rawFile={item.rawFile}
                      alt={item.record?.title || item.displayName}
                    />
                  )}

                  {canPreview ? (
                    <button
                      type="button"
                      className="absolute inset-0 z-10 cursor-zoom-in rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      aria-label={`${previewMessages.preview}: ${filename}`}
                      onClick={() => {
                        setPreviewIndex(itemPreviewIndex);
                        setPreviewOpen(true);
                      }}
                    />
                  ) : null}

                  {item.showStatus ? (
                    <div className="pointer-events-none absolute bottom-2 right-2 z-20">
                      <UploadStatusIcon item={item} messages={messages} />
                    </div>
                  ) : null}

                  {!readOnly ? (
                    <div className="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                      {item.status === "error" && item.rawFile ? (
                        <IconButton
                          icon={RotateCcw}
                          label={messages.retry}
                          disabled={disabled || reachedLimit}
                          onClick={() => void retryItem(item.key)}
                        />
                      ) : null}
                      {canCancel ? (
                        <IconButton
                          icon={X}
                          label={messages.cancel}
                          disabled={disabled}
                          onClick={() => cancelItem(item.key)}
                        />
                      ) : (
                        <IconButton
                          icon={Trash2}
                          label={messages.remove}
                          disabled={disabled}
                          showTooltip={showRemoveTooltip}
                          onClick={() => removeItem(item.key)}
                        />
                      )}
                    </div>
                  ) : null}
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <div
                        className={cn(
                          "mt-1 w-[104px] truncate text-center text-xs text-muted-foreground",
                          item.status === "error" && "text-destructive"
                        )}
                      />
                    }
                  >
                    {item.status === "error"
                      ? item.error?.message || messages.failed
                      : item.displayName}
                  </TooltipTrigger>
                  <TooltipContent>
                    {item.status === "error"
                      ? item.error?.message || messages.failed
                      : item.displayName}
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}

          {selectable ? (
            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "relative flex h-[104px] w-[104px] flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed bg-card p-2 text-center transition-colors hover:bg-muted/40",
                isDragging && "border-primary bg-primary/5"
              )}
            >
              <input
                type="file"
                multiple={multiple}
                accept={getAcceptAttribute(descriptor.accept)}
                aria-label={multiple ? messages.chooseFiles : messages.chooseFile}
                className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                onChange={(event) => {
                  handleSelectedFiles(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              <div className="pointer-events-none flex flex-col items-center justify-center">
                <Plus className="mb-1 size-5 text-muted-foreground" />
                <span className="px-1 text-xs font-medium">
                  {multiple ? messages.chooseFiles : messages.chooseFile}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </TooltipProvider>

      {!readOnly ? (
        <p className="text-xs text-muted-foreground">
          {reachedLimit
            ? messages.maxFilesReached
            : disabled
            ? messages.uploadDisabled
            : isDragging
            ? messages.dragActive
            : descriptor.accept
            ? getAcceptAttribute(descriptor.accept)
            : messages.dragInactive}
        </p>
      ) : null}

      {readOnly && !items.length ? (
        <p className="text-sm text-muted-foreground">{messages.noFiles}</p>
      ) : null}

      <div className="sr-only" aria-live="polite">
        {items
          .map((item) => `${item.displayName}: ${getStatusLabel(item, messages)}`)
          .join(". ")}
      </div>

      <FilePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        files={previewableFiles}
        initialIndex={previewIndex}
        descriptor={descriptor}
        messages={previewMessages}
      />
    </div>
  );
}

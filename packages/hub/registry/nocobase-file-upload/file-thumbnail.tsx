import {
  FileArchive,
  FileAudio,
  FileChartColumn,
  FileCode,
  FileIcon,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { getThumbnailUrl } from "./file-url";
import {
  getFileExtension,
  getFileMimeType,
  isActiveContentFile,
  isAudioFile,
  isImageFile,
  isPdfFile,
  isVideoFile,
} from "./file-preview-types";
import type { NocoBaseFileRecord } from "./types";

type FileThumbnailKind =
  | "archive"
  | "audio"
  | "code"
  | "default"
  | "document"
  | "image"
  | "json"
  | "pdf"
  | "presentation"
  | "spreadsheet"
  | "video";

export type FileThumbnailProps = {
  file?: NocoBaseFileRecord;
  rawFile?: File;
  alt?: string;
  className?: string;
  iconClassName?: string;
  imageClassName?: string;
  showExtensionBadge?: boolean;
};

const archiveExtensions = new Set([
  ".7z",
  ".bz2",
  ".gz",
  ".rar",
  ".tar",
  ".tgz",
  ".zip",
]);

const documentExtensions = new Set([
  ".doc",
  ".docx",
  ".md",
  ".odt",
  ".rtf",
  ".txt",
]);

const spreadsheetExtensions = new Set([".csv", ".ods", ".xls", ".xlsx"]);
const presentationExtensions = new Set([".odp", ".ppt", ".pptx"]);
const jsonExtensions = new Set([".json"]);
const codeExtensions = new Set([
  ".css",
  ".htm",
  ".html",
  ".js",
  ".jsx",
  ".svg",
  ".ts",
  ".tsx",
  ".xml",
  ".yml",
  ".yaml",
]);

const thumbnailStyles: Record<
  FileThumbnailKind,
  { Icon: LucideIcon; className: string; badgeClassName: string }
> = {
  archive: {
    Icon: FileArchive,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    badgeClassName: "bg-amber-600 text-white dark:bg-amber-500 dark:text-black",
  },
  audio: {
    Icon: FileAudio,
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    badgeClassName: "bg-violet-600 text-white dark:bg-violet-500 dark:text-black",
  },
  code: {
    Icon: FileCode,
    className: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    badgeClassName: "bg-slate-700 text-white dark:bg-slate-300 dark:text-black",
  },
  default: {
    Icon: FileIcon,
    className: "bg-muted/40 text-muted-foreground",
    badgeClassName: "bg-muted-foreground text-background",
  },
  document: {
    Icon: FileText,
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    badgeClassName: "bg-blue-600 text-white dark:bg-blue-500 dark:text-black",
  },
  image: {
    Icon: FileImage,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    badgeClassName: "bg-sky-600 text-white dark:bg-sky-500 dark:text-black",
  },
  json: {
    Icon: FileJson,
    className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    badgeClassName: "bg-indigo-600 text-white dark:bg-indigo-500 dark:text-black",
  },
  pdf: {
    Icon: FileText,
    className: "bg-red-500/10 text-red-700 dark:text-red-300",
    badgeClassName: "bg-red-600 text-white dark:bg-red-500 dark:text-black",
  },
  presentation: {
    Icon: FileChartColumn,
    className: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    badgeClassName: "bg-orange-600 text-white dark:bg-orange-500 dark:text-black",
  },
  spreadsheet: {
    Icon: FileSpreadsheet,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    badgeClassName: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-black",
  },
  video: {
    Icon: FileVideo,
    className: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
    badgeClassName: "bg-fuchsia-600 text-white dark:bg-fuchsia-500 dark:text-black",
  },
};

function getNameExtension(value?: string) {
  if (!value) return "";
  const dotIndex = value.lastIndexOf(".");
  return dotIndex >= 0 ? value.slice(dotIndex).toLowerCase() : "";
}

function getRecordExtension(file?: NocoBaseFileRecord) {
  if (!file) return "";
  return file.extname
    ? file.extname.startsWith(".")
      ? file.extname.toLowerCase()
      : `.${file.extname.toLowerCase()}`
    : getNameExtension(file.title) || getNameExtension(file.filename);
}

function getRawFileExtension(file?: File) {
  return getNameExtension(file?.name);
}

function getExtensionLabel(extension: string) {
  const label = extension.replace(/^\./, "").toUpperCase();
  if (!label) return "";
  return label.length > 5 ? label.slice(0, 5) : label;
}

function getRawFileKind(file?: File): FileThumbnailKind {
  const mimetype = file?.type.toLowerCase() ?? "";
  const extension = getRawFileExtension(file);

  if (codeExtensions.has(extension)) return "code";
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype === "application/pdf" || extension === ".pdf") return "pdf";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype === "application/json" || jsonExtensions.has(extension)) return "json";
  if (mimetype.startsWith("text/") || documentExtensions.has(extension)) return "document";
  if (spreadsheetExtensions.has(extension)) return "spreadsheet";
  if (presentationExtensions.has(extension)) return "presentation";
  if (archiveExtensions.has(extension)) return "archive";
  return "default";
}

function getFileThumbnailKind(file: NocoBaseFileRecord): FileThumbnailKind {
  const extension = getRecordExtension(file) || getFileExtension(file);
  const mimetype = getFileMimeType(file);

  if (isActiveContentFile(file)) return "code";
  if (isImageFile(file)) return "image";
  if (isPdfFile(file)) return "pdf";
  if (isAudioFile(file)) return "audio";
  if (isVideoFile(file)) return "video";
  if (mimetype === "application/json" || jsonExtensions.has(extension)) return "json";
  if (spreadsheetExtensions.has(extension)) return "spreadsheet";
  if (presentationExtensions.has(extension)) return "presentation";
  if (archiveExtensions.has(extension)) return "archive";
  if (codeExtensions.has(extension)) return "code";
  if (mimetype.startsWith("text/") || documentExtensions.has(extension)) return "document";
  return "default";
}

export function FileThumbnail({
  file,
  rawFile,
  alt,
  className,
  iconClassName,
  imageClassName,
  showExtensionBadge = true,
}: FileThumbnailProps) {
  const thumbnailUrl = file ? getThumbnailUrl(file) : "";
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(
    file && isImageFile(file) && thumbnailUrl && !imageFailed
  );

  useEffect(() => setImageFailed(false), [thumbnailUrl]);

  if (showImage) {
    return (
      <img
        data-slot="file-thumbnail"
        src={thumbnailUrl}
        alt={alt ?? file?.title ?? file?.filename ?? ""}
        className={cn("h-full w-full object-cover", imageClassName)}
        onError={() => setImageFailed(true)}
      />
    );
  }

  const kind = file ? getFileThumbnailKind(file) : getRawFileKind(rawFile);
  const extension = file ? getRecordExtension(file) : getRawFileExtension(rawFile);
  const extensionLabel = getExtensionLabel(extension);
  const style = thumbnailStyles[kind];
  const Icon = style.Icon;

  return (
    <span
      data-slot="file-thumbnail"
      className={cn(
        "relative flex h-full w-full items-center justify-center rounded-md",
        style.className,
        className
      )}
    >
      <Icon className={cn("size-7", iconClassName)} />
      {showExtensionBadge && extensionLabel ? (
        <span
          className={cn(
            "absolute bottom-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-normal shadow-sm",
            style.badgeClassName
          )}
        >
          {extensionLabel}
        </span>
      ) : null}
    </span>
  );
}

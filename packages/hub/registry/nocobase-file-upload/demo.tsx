import {
  FileUp,
  FolderOpen,
  RotateCcw,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { FilePreviewDialog } from "./file-preview-dialog";
import { getFileName } from "./file-url";
import { FileThumbnail } from "./file-thumbnail";
import { FileUploadField } from "./file-upload-field";
import type {
  FileFieldDescriptor,
  FileUploadFieldValue,
  NocoBaseFileRecord,
} from "./types";

type ManagedFileRecord = NocoBaseFileRecord & {
  demoSource: "mock" | "uploaded";
};

const fileManagerDescriptor = {
  sourceCollection: "attachments",
  fieldName: "attachments",
  fileCollection: "attachments",
  dataSourceKey: "main",
  relation: "belongsToMany",
} satisfies FileFieldDescriptor;

const mockFiles: ManagedFileRecord[] = [
  {
    id: "mock-image",
    demoSource: "mock",
    title: "Workspace photo",
    filename: "workspace.jpg",
    extname: ".jpg",
    mimetype: "image/jpeg",
    size: 134_214,
    url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
    preview:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=480&q=80",
  },
  {
    id: "mock-pdf",
    demoSource: "mock",
    title: "PDF.js sample",
    filename: "tracemonkey.pdf",
    extname: ".pdf",
    mimetype: "application/pdf",
    url: "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf",
  },
  {
    id: "mock-excel",
    demoSource: "mock",
    title: "Financial sample",
    filename: "financial-sample.xlsx",
    extname: ".xlsx",
    mimetype:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    url: "https://download.microsoft.com/download/1/4/E/14EDED28-6C58-4055-A65C-23B4DA81C4DE/Financial%20Sample.xlsx",
  },
  {
    id: "mock-word",
    demoSource: "mock",
    title: "Document sample",
    filename: "demo.docx",
    extname: ".docx",
    mimetype:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    url: "https://calibre-ebook.com/downloads/demos/demo.docx",
  },
  {
    id: "mock-markdown",
    demoSource: "mock",
    title: "NocoBase README",
    filename: "README.md",
    extname: ".md",
    mimetype: "text/markdown",
    url: "https://raw.githubusercontent.com/nocobase/nocobase/main/README.md",
  },
  {
    id: "mock-audio",
    demoSource: "mock",
    title: "Audio sample",
    filename: "t-rex-roar.mp3",
    extname: ".mp3",
    mimetype: "audio/mpeg",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
  },
  {
    id: "mock-video",
    demoSource: "mock",
    title: "Video sample",
    filename: "flower.mp4",
    extname: ".mp4",
    mimetype: "video/mp4",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  },
];

export function FileManagerDemoPage() {
  const [uploadValue, setUploadValue] =
    useState<FileUploadFieldValue>(null);
  const [search, setSearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [files, setFiles] = useState<ManagedFileRecord[]>(mockFiles);

  const visibleFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return files;

    return files.filter((file) =>
      [file.title, file.filename, file.extname, file.mimetype].some((value) =>
        value?.toLowerCase().includes(query)
      )
    );
  }, [files, search]);

  return (
    <div className="space-y-8 pb-12">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <FolderOpen className="size-4" />
          File manager
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          File upload and preview
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Public URL samples make every preview type available without listing
          the server&apos;s attachments collection. New uploads are added to this
          page for the current browser session.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="size-4" />
            Upload files
          </CardTitle>
          <CardDescription>
            Files are uploaded to the configured NocoBase storage. Images, PDF,
            text, audio, video, and Office documents use their matching previewer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUploadField
            descriptor={fileManagerDescriptor}
            value={uploadValue}
            onChange={setUploadValue}
            maxFiles={20}
            showRemoveTooltip={false}
            messages={{
              chooseFiles: "Add files",
              dragInactive: "Drag files here, or choose them from your device.",
            }}
            previewMessages={{ noFiles: "No uploaded files" }}
            onUploadComplete={(record) =>
              setFiles((current) => [
                {
                  ...record,
                  demoSource: "uploaded",
                },
                ...current.filter(
                  (file) => String(file.id) !== String(record.id)
                ),
              ])
            }
          />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Preview gallery</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {visibleFiles.length === files.length
                ? `${files.length} files in this demo`
                : `${visibleFiles.length} of ${files.length} files`}
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search filename or type"
                aria-label="Search files"
                className="pl-8"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Restore public samples"
              title="Restore public samples"
              onClick={() =>
                setFiles((current) => [
                  ...mockFiles,
                  ...current.filter((file) => file.demoSource === "uploaded"),
                ])
              }
            >
              <RotateCcw />
            </Button>
          </div>
        </div>

        {visibleFiles.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {visibleFiles.map((file, index) => (
              <Card key={String(file.id)} size="sm" className="min-w-0">
                <CardContent className="space-y-3">
                  <button
                    type="button"
                    className="relative flex aspect-square w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-lg border bg-muted/30 outline-none transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label={`Preview ${getFileName(file)}`}
                    onClick={() => {
                      setPreviewIndex(index);
                      setPreviewOpen(true);
                    }}
                  >
                    <FileThumbnail file={file} alt={getFileName(file)} />
                  </button>
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-medium"
                      title={getFileName(file)}
                    >
                      {getFileName(file)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 text-center">
            <FolderOpen className="size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              {search ? "No matching files" : "No files yet"}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              {search
                ? "Try another filename or MIME type."
                : "Restore the public samples or upload a file above to test its preview."}
            </p>
          </div>
        )}
      </section>

      <FilePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        files={visibleFiles}
        initialIndex={previewIndex}
        descriptor={fileManagerDescriptor}
      />
    </div>
  );
}

export default FileManagerDemoPage;

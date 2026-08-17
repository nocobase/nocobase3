import { Download, FileText, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { FilePreviewerProps } from "../file-preview-types";
import { getPreviewFileUrl } from "../file-url";

const markdownComponents: Components = {
  h1: ({ className, ...props }) => (
    <h1
      {...props}
      className={cn(
        "mb-4 mt-8 text-3xl font-bold tracking-tight first:mt-0",
        className
      )}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      {...props}
      className={cn(
        "mb-3 mt-8 border-b pb-2 text-2xl font-semibold tracking-tight first:mt-0",
        className
      )}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      {...props}
      className={cn(
        "mb-2 mt-6 text-xl font-semibold tracking-tight first:mt-0",
        className
      )}
    />
  ),
  p: ({ className, ...props }) => (
    <p {...props} className={cn("my-3 leading-7", className)} />
  ),
  ul: ({ className, ...props }) => (
    <ul
      {...props}
      className={cn("my-3 ml-6 list-disc space-y-1", className)}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      {...props}
      className={cn("my-3 ml-6 list-decimal space-y-1", className)}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      {...props}
      className={cn(
        "my-4 border-l-4 border-border pl-4 italic text-muted-foreground",
        className
      )}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      {...props}
      className={cn("underline underline-offset-4", className)}
      target="_blank"
      rel="noreferrer"
    />
  ),
  table: ({ className, ...props }) => (
    <div className="my-4 w-full overflow-x-auto rounded-md border">
      <table
        {...props}
        className={cn("w-full border-collapse text-sm", className)}
      />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      {...props}
      className={cn(
        "border-b border-r bg-muted/60 px-3 py-2 text-left font-semibold last:border-r-0",
        className
      )}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      {...props}
      className={cn(
        "border-b border-r px-3 py-2 align-top last:border-r-0",
        className
      )}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      {...props}
      className={cn(
        "my-4 overflow-x-auto rounded-lg bg-muted p-4 text-sm",
        className
      )}
    />
  ),
  code: ({ className, ...props }) => (
    <code
      {...props}
      className={cn(
        "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em]",
        className
      )}
    />
  ),
};

function PreviewLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-medium">
      <FileText className="size-4" />
      {children}
    </div>
  );
}

function useTextFile(file: FilePreviewerProps["file"]) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    setContent("");
    setError(undefined);
    setLoading(true);

    fetch(getPreviewFileUrl(file), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load file (${response.status})`);
        }
        return response.text();
      })
      .then(setContent)
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error ? caught.message : "Unable to load file"
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [file]);

  return { content, loading, error };
}

function TextPreviewLayout({
  content,
  loading,
  error,
  renderContent,
  file,
  messages,
  onDownload,
}: FilePreviewerProps &
  ReturnType<typeof useTextFile> & {
    renderContent: (content: string) => ReactNode;
  }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col bg-background">
      <PreviewLabel>{messages.textTitle}</PreviewLabel>
      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {messages.preview}
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Alert className="max-w-md">
            <FileText className="size-4" />
            <AlertDescription className="space-y-4">
              <p>{error}</p>
              <Button type="button" onClick={() => onDownload(file)}>
                <Download />
                {messages.download}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {renderContent(content)}
        </div>
      )}
    </div>
  );
}

export function TextPreviewer(props: FilePreviewerProps) {
  const state = useTextFile(props.file);
  return (
    <TextPreviewLayout
      {...props}
      {...state}
      renderContent={(content) => (
        <pre className="whitespace-pre-wrap break-words p-5 font-mono text-xs leading-5 text-foreground">
          {content}
        </pre>
      )}
    />
  );
}

export function MarkdownPreviewer(props: FilePreviewerProps) {
  const state = useTextFile(props.file);
  return (
    <TextPreviewLayout
      {...props}
      {...state}
      renderContent={(content) => (
        <article className="mx-auto w-full max-w-4xl px-6 py-5 text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </article>
      )}
    />
  );
}

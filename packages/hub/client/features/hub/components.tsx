import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Inbox,
  Loader2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { HubApiError } from "./api";
import { getStatusLabel, getStatusVariant } from "./status";

export function HubStatusBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  return (
    <Badge variant={getStatusVariant(status)}>
      {status === "succeeded" ? <CheckCircle2 aria-hidden="true" /> : null}
      {getStatusLabel(status)}
    </Badge>
  );
}

export function HubLoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="flex min-h-32 items-center justify-center"
      role="status"
      aria-label={label}
    >
      <Loader2
        className="size-5 animate-spin text-muted-foreground"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function HubErrorState({
  error,
  onRetry,
  title = "Unable to load Hub data",
}: {
  error: Error | null | undefined;
  onRetry?: () => void;
  title?: string;
}) {
  const apiError = error as Partial<HubApiError> | null | undefined;
  const status = apiError?.status;
  const message =
    status === 403
      ? "You do not have permission to view this resource."
      : status === 404
        ? "This resource could not be found."
        : error?.message || "Please try again.";

  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{message}</span>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function HubEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Empty className="min-h-56 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function HubNotFoundState({ kind }: { kind: string }) {
  return (
    <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleHelp aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{kind} not found</EmptyTitle>
        <EmptyDescription>
          The requested {kind.toLowerCase()} is unavailable or you do not have
          access to it.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function HubListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-label="Loading list" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function HubLoadMore({
  hasMore,
  loading,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center">
      <Button
        type="button"
        variant="outline"
        disabled={loading}
        onClick={onLoadMore}
      >
        {loading ? "Loading more…" : "Load more"}
      </Button>
    </div>
  );
}

export function formatHubDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatHubBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

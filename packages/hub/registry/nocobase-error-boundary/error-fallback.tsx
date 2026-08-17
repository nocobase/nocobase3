import {
  AlertTriangle,
  Check,
  Copy,
  House,
  RefreshCcw,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  copyPortalDiagnostic,
  formatPortalErrorDiagnostic,
  normalizePortalError,
  redactPortalErrorText,
  type PortalErrorDiagnosticContext,
} from "./error-diagnostics";
import {
  getErrorBoundaryLabels,
  type ErrorBoundaryLabels,
} from "./labels";

export type ErrorBoundaryVariant = "page" | "region" | "root";

const secondaryButtonClassName =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const primaryButtonClassName =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

export type NocoBaseErrorFallbackProps = {
  componentStack?: string | null;
  context?: Omit<PortalErrorDiagnosticContext, "componentStack" | "occurredAt">;
  error: unknown;
  labels?: Partial<ErrorBoundaryLabels>;
  locale?: string;
  onBackHome?: () => void;
  onReload?: () => void;
  onRetry?: () => void;
  variant?: ErrorBoundaryVariant;
};

export function NocoBaseErrorFallback({
  componentStack,
  context,
  error,
  labels: labelOverrides,
  locale,
  onBackHome,
  onReload,
  onRetry,
  variant = "page",
}: NocoBaseErrorFallbackProps) {
  const [copyStatus, setCopyStatus] = useState<
    "copied" | "failed" | "idle"
  >("idle");
  const [detailsOpen, setDetailsOpen] = useState(variant !== "region");
  const [occurredAt] = useState(() => new Date().toISOString());
  const labels = getErrorBoundaryLabels(locale, labelOverrides);
  const normalizedError = normalizePortalError(error);
  const message = redactPortalErrorText(normalizedError.message);
  const diagnostic = useMemo(
    () =>
      formatPortalErrorDiagnostic(error, {
        ...context,
        componentStack,
        occurredAt,
        route:
          context?.route ??
          (typeof window === "undefined" ? undefined : window.location.pathname),
      }),
    [componentStack, context, error, occurredAt]
  );

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timeout = window.setTimeout(() => setCopyStatus("idle"), 2000);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const containerClassName =
    variant === "root"
      ? "flex min-h-svh items-center justify-center bg-background p-5 sm:p-8"
      : variant === "page"
        ? "flex min-h-[50vh] w-full items-center justify-center py-8"
        : "w-full rounded-lg border border-destructive/25 bg-card p-4 shadow-sm";
  const panelClassName =
    variant === "root"
      ? "w-full max-w-2xl rounded-xl border bg-card p-5 shadow-lg sm:p-7"
      : variant === "page"
        ? "w-full max-w-2xl rounded-xl border bg-card p-5 shadow-sm sm:p-6"
        : "w-full";
  const Heading = variant === "region" ? "h2" : "h1";
  const copyLabel =
    copyStatus === "copied"
      ? labels.copied
      : copyStatus === "failed"
        ? labels.copyFailed
        : labels.copyDetails;

  return (
    <div className={containerClassName} data-error-boundary={variant}>
      <div className={panelClassName}>
        <div role="alert">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <Heading className="text-base font-semibold text-foreground sm:text-lg">
                {labels.title}
              </Heading>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {labels.description}
              </p>
            </div>
          </div>

          <pre className="mt-4 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-destructive/20 bg-destructive/5 p-3 font-mono text-xs leading-5 text-destructive">
            {`${normalizedError.name}: ${message}`}
          </pre>
        </div>

        <details
          className="mt-3 rounded-md border bg-muted/30"
          open={detailsOpen}
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-foreground">
            {labels.details}
          </summary>
          <div className="border-t p-3">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">
              {diagnostic}
            </pre>
            <button
              type="button"
              className={`${secondaryButtonClassName} mt-3`}
              onClick={async () => {
                try {
                  await copyPortalDiagnostic(diagnostic);
                  setCopyStatus("copied");
                } catch (copyError) {
                  setCopyStatus("failed");
                  console.error("Unable to copy Portal diagnostic information", copyError);
                }
              }}
            >
              {copyStatus === "copied" ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              <span aria-live="polite">{copyLabel}</span>
            </button>
          </div>
        </details>

        {(onRetry || onReload || onBackHome) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {onRetry && (
              <button type="button" className={primaryButtonClassName} onClick={onRetry}>
                <RotateCcw className="size-4" aria-hidden="true" />
                {labels.retry}
              </button>
            )}
            {onReload && (
              <button type="button" className={secondaryButtonClassName} onClick={onReload}>
                <RefreshCcw className="size-4" aria-hidden="true" />
                {labels.reload}
              </button>
            )}
            {onBackHome && (
              <button type="button" className={secondaryButtonClassName} onClick={onBackHome}>
                <House className="size-4" aria-hidden="true" />
                {labels.backHome}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import type { ErrorInfo, PropsWithChildren } from "react";
import { useCallback, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";

import {
  NocoBaseErrorFallback,
  type ErrorBoundaryVariant,
} from "./error-fallback";
import type { PortalErrorDiagnosticContext } from "./error-diagnostics";
import type { ErrorBoundaryLabels } from "./labels";

export type NocoBaseErrorBoundaryProps = PropsWithChildren<{
  context?: Omit<PortalErrorDiagnosticContext, "componentStack" | "occurredAt">;
  labels?: Partial<ErrorBoundaryLabels>;
  locale?: string;
  onBackHome?: () => void;
  onError?: (error: unknown, info: ErrorInfo) => void;
  onReload?: () => void;
  onReset?: () => void;
  resetKeys?: unknown[];
  variant?: ErrorBoundaryVariant;
}>;

export function NocoBaseErrorBoundary({
  children,
  context,
  labels,
  locale,
  onBackHome,
  onError,
  onReload,
  onReset,
  resetKeys,
  variant = "page",
}: NocoBaseErrorBoundaryProps) {
  const [componentStack, setComponentStack] = useState<string | null>();
  const handleError = useCallback(
    (error: unknown, info: ErrorInfo) => {
      setComponentStack(info.componentStack);
      if (onError) {
        onError(error, info);
      } else {
        console.error("Portal runtime error", error, info);
      }
    },
    [onError]
  );

  return (
    <ErrorBoundary
      resetKeys={resetKeys}
      onError={handleError}
      onReset={() => {
        setComponentStack(undefined);
        onReset?.();
      }}
      fallbackRender={({ error, resetErrorBoundary }) => (
        <NocoBaseErrorFallback
          variant={variant}
          error={error}
          componentStack={componentStack}
          context={context}
          locale={locale}
          labels={labels}
          onRetry={resetErrorBoundary}
          onReload={
            onReload ??
            (variant === "region" || typeof window === "undefined"
              ? undefined
              : () => window.location.reload())
          }
          onBackHome={onBackHome}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

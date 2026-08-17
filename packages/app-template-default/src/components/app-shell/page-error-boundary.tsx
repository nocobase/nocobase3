import { NocoBaseErrorBoundary } from "@/extensions/nocobase-error-boundary";
import { useTranslate } from "@refinedev/core";
import type { PropsWithChildren } from "react";
import { useLocation, useNavigate } from "react-router";

export function PageErrorBoundary({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const translate = useTranslate();

  return (
    <NocoBaseErrorBoundary
      variant="page"
      resetKeys={[location.pathname, location.search, location.hash]}
      context={{
        route: location.pathname,
        templateName: __PORTAL_TEMPLATE_NAME__,
        templateVersion: __PORTAL_TEMPLATE_VERSION__,
      }}
      labels={{
        title: translate(
          "runtimeError.title",
          "Something went wrong"
        ),
        description: translate(
          "runtimeError.description",
          "This page could not be displayed. Copy the diagnostic information if you need help."
        ),
        details: translate(
          "runtimeError.details",
          "Diagnostic information"
        ),
        copyDetails: translate(
          "runtimeError.copyDetails",
          "Copy diagnostic information"
        ),
        copied: translate("runtimeError.copied", "Copied"),
        copyFailed: translate("runtimeError.copyFailed", "Copy failed"),
        retry: translate("runtimeError.retry", "Try again"),
        reload: translate("runtimeError.reload", "Reload page"),
        backHome: translate("runtimeError.backHome", "Back to homepage"),
      }}
      onBackHome={() => navigate("/")}
    >
      {children}
    </NocoBaseErrorBoundary>
  );
}

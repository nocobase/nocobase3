import type { NocoBaseRuntimeError } from "@nocobase/portal-sdk/client";
import { translate } from "@nocobase/portal-sdk/i18n";
import {
  AlertTriangle,
  Check,
  Copy,
  LoaderCircle,
  LogOut,
  RefreshCcw,
  ServerOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  copyPortalDiagnostic,
  formatPortalErrorDiagnostic,
  redactPortalErrorText,
  type PortalErrorDiagnosticContext,
} from "./error-diagnostics";
import { NOCOBASE_ERROR_BOUNDARY_I18N_NAMESPACE } from "./locales";

type RuntimeStatusText = {
  description: string;
  standalone?: boolean;
  title: string;
  tone: "error" | "info" | "warning";
  waiting?: boolean;
};

const failureCodes = new Set([
  "APP_ERROR",
  "COMMAND_ERROR",
  "ENOENT",
  "LOAD_ERROR",
]);

export type NocoBaseRuntimeStatusProps = {
  context?: Omit<PortalErrorDiagnosticContext, "componentStack" | "occurredAt">;
  error: NocoBaseRuntimeError;
  locale?: string;
  onLogout?: () => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
  retrying?: boolean;
};

const commandTitles: Record<string, { defaultMessage: string; key: string }> = {
  install: {
    key: "runtime.command.install",
    defaultMessage: "Installing application",
  },
  refresh: {
    key: "runtime.command.refresh",
    defaultMessage: "Refreshing application",
  },
  restart: {
    key: "runtime.command.restart",
    defaultMessage: "Restarting application",
  },
  restore: {
    key: "runtime.command.restore",
    defaultMessage: "Restoring application",
  },
  start: {
    key: "runtime.command.start",
    defaultMessage: "Starting application",
  },
  upgrade: {
    key: "runtime.command.upgrade",
    defaultMessage: "Upgrading application",
  },
  "pm.add": {
    key: "runtime.command.pm.add",
    defaultMessage: "Adding plugin",
  },
  "pm.disable": {
    key: "runtime.command.pm.disable",
    defaultMessage: "Disabling plugin",
  },
  "pm.enable": {
    key: "runtime.command.pm.enable",
    defaultMessage: "Enabling plugin",
  },
  "pm.remove": {
    key: "runtime.command.pm.remove",
    defaultMessage: "Removing plugin",
  },
  "pm.update": {
    key: "runtime.command.pm.update",
    defaultMessage: "Updating plugin",
  },
};

const lifecycleStatuses: Record<
  string,
  {
    description: { defaultMessage: string; key: string };
    title: { defaultMessage: string; key: string };
  }
> = {
  APP_PREPARING: {
    title: {
      key: "runtime.preparing.title",
      defaultMessage: "App preparing",
    },
    description: {
      key: "runtime.preparing.description",
      defaultMessage: "The application is preparing. This may take a moment.",
    },
  },
  APP_INITIALIZING: {
    title: {
      key: "runtime.initializing.title",
      defaultMessage: "App initializing",
    },
    description: {
      key: "runtime.initializing.description",
      defaultMessage: "The application is initializing. This may take a moment.",
    },
  },
  APP_INITIALIZED: {
    title: {
      key: "runtime.initialized.title",
      defaultMessage: "App initialized",
    },
    description: {
      key: "runtime.initialized.description",
      defaultMessage: "The application has initialized and is waiting to continue.",
    },
  },
  APP_STARTING: {
    title: {
      key: "runtime.starting.title",
      defaultMessage: "App starting",
    },
    description: {
      key: "runtime.starting.description",
      defaultMessage: "The application is starting. This may take a moment.",
    },
  },
  COMMAND_END: {
    title: {
      key: "runtime.maintenance.title",
      defaultMessage: "Application maintenance in progress",
    },
    description: {
      key: "runtime.maintenance.description",
      defaultMessage: "Maintenance is in progress. This may take a moment.",
    },
  },
};

const t = (key: string, defaultMessage: string, locale?: string) =>
  translate(
    key,
    {
      ns: NOCOBASE_ERROR_BOUNDARY_I18N_NAMESPACE,
      ...(locale ? { lng: locale } : {}),
    },
    defaultMessage
  );

const getRuntimeStatusText = (
  error: NocoBaseRuntimeError,
  locale?: string
): RuntimeStatusText => {
  const code = error.code;

  if (code === "APP_COMMANDING") {
    const name = error.command?.name;
    const commandTitle = name ? commandTitles[name] : undefined;
    return {
      title:
        (commandTitle &&
          t(commandTitle.key, commandTitle.defaultMessage, locale)) ||
        t(
          "runtime.maintenance.title",
          "Application maintenance in progress",
          locale
        ),
      description:
        error.message ||
        t(
          "runtime.maintenance.description",
          "Maintenance is in progress. This may take a moment.",
          locale
        ),
      tone: "info",
      waiting: true,
    };
  }

  const lifecycleStatus = code ? lifecycleStatuses[code] : undefined;
  if (lifecycleStatus) {
    return {
      title: t(
        lifecycleStatus.title.key,
        lifecycleStatus.title.defaultMessage,
        locale
      ),
      description:
        error.message ||
        t(
          lifecycleStatus.description.key,
          lifecycleStatus.description.defaultMessage,
          locale
        ),
      tone: "info",
      waiting: true,
    };
  }

  if (code === "APP_STOPPED") {
    return {
      title: t("runtime.stopped.title", "Application is stopped", locale),
      description: t(
        "runtime.stopped.description",
        "Start the application on the server, then try again.",
        locale
      ),
      standalone: true,
      tone: "warning",
    };
  }

  if (code === "APP_NOT_FOUND") {
    return {
      title: t("runtime.notFound.title", "Application not found", locale),
      description: t(
        "runtime.notFound.description",
        "Check the Portal server URL and sub-application name.",
        locale
      ),
      tone: "warning",
    };
  }

  if (code === "APP_NOT_INSTALLED_ERROR") {
    return {
      title: t(
        "runtime.notInstalled.title",
        "Application is not installed",
        locale
      ),
      description: t(
        "runtime.notInstalled.description",
        "Install the application first.",
        locale
      ),
      tone: "warning",
    };
  }

  if (code === "USER_HAS_NO_ROLES_ERR") {
    return {
      title: t(
        "runtime.noRoles.title",
        "No role is available for this account",
        locale
      ),
      description: t(
        "runtime.noRoles.description",
        "Ask an administrator to assign a role to this account, then try again.",
        locale
      ),
      tone: "warning",
    };
  }

  if (["ROLE_NOT_FOUND_ERR", "ROLE_NOT_FOUND_FOR_USER"].includes(code ?? "")) {
    return {
      title: t(
        "runtime.refreshingRole.title",
        "Refreshing your role",
        locale
      ),
      description: t(
        "runtime.refreshingRole.description",
        "The previous role is no longer available. Your current role is being refreshed.",
        locale
      ),
      tone: "info",
      waiting: true,
    };
  }

  if (code && failureCodes.has(code)) {
    return {
      title: t("runtime.failed.title", "Application failed", locale),
      description: t(
        "runtime.failed.description",
        "Copy the diagnostic information and contact an administrator.",
        locale
      ),
      tone: "error",
    };
  }

  if (error.status === 503) {
    return {
      title: t(
        "runtime.reconnecting.title",
        "Reconnecting to NocoBase",
        locale
      ),
      description: t(
        "runtime.reconnecting.description",
        "The service is temporarily unavailable. Try again shortly.",
        locale
      ),
      tone: "info",
    };
  }

  if (error.maintaining && code) {
    return {
      title: t("runtime.failed.title", "Application failed", locale),
      description: t(
        "runtime.failed.description",
        "Copy the diagnostic information and contact an administrator.",
        locale
      ),
      tone: "error",
    };
  }

  if (error.status && error.status < 500) {
    return {
      title: t(
        "runtime.access.title",
        "Unable to verify application access",
        locale
      ),
      description: t(
        "runtime.access.description",
        "Try again, or copy the diagnostic information and contact an administrator.",
        locale
      ),
      tone: "warning",
    };
  }

  return {
    title: t(
      "runtime.unavailable.title",
      "Service temporarily unavailable",
      locale
    ),
    description: t(
      "runtime.unavailable.description",
      "The NocoBase service cannot be reached. Try again shortly.",
      locale
    ),
    tone: "error",
  };
};

export function NocoBaseRuntimeStatus({
  context,
  error,
  locale,
  onLogout,
  onRetry,
  retrying = false,
}: NocoBaseRuntimeStatusProps) {
  const text = getRuntimeStatusText(error, locale);
  const [copyStatus, setCopyStatus] = useState<
    "copied" | "failed" | "idle"
  >("idle");
  const diagnostic = useMemo(
    () =>
      formatPortalErrorDiagnostic(error, {
        ...context,
        occurredAt: new Date().toISOString(),
      }),
    [context, error]
  );

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = window.setTimeout(() => setCopyStatus("idle"), 2_000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  const iconClassName =
    text.tone === "error"
      ? "bg-destructive/10 text-destructive"
      : text.tone === "warning"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-primary/10 text-primary";
  const Icon =
    error.status && error.status >= 500 ? ServerOff : AlertTriangle;
  const secondaryButton =
    "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground shadow-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50";
  const primaryButton =
    "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50";

  if (text.waiting) {
    return (
      <div className="grid min-h-svh place-items-center bg-background p-6">
        <div className="relative size-10" role="status">
          <LoaderCircle
            className="size-10 animate-spin text-primary"
            aria-hidden="true"
          />
          <div className="absolute top-full left-1/2 mt-5 flex w-[min(36rem,calc(100vw-3rem))] -translate-x-1/2 flex-col items-center text-center">
            <h1 className="text-xl font-semibold text-foreground">
              {text.title}
            </h1>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {redactPortalErrorText(text.description)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (text.standalone) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-6">
        <div
          className="flex max-w-xl flex-col items-center text-center"
          role="status"
        >
          <ServerOff
            className="size-10 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <h1 className="mt-5 text-xl font-semibold text-foreground">
            {text.title}
          </h1>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {redactPortalErrorText(text.description)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-5 sm:p-8">
      <div className="w-full max-w-2xl rounded-xl border bg-card p-5 shadow-lg sm:p-7">
        <div className="flex items-start gap-3" role="alert">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconClassName}`}
          >
            <Icon
              className="size-5"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">
              {text.title}
            </h1>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {redactPortalErrorText(text.description)}
            </p>
            {error.code && (
              <code className="mt-3 inline-flex rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                {error.code}
              </code>
            )}
          </div>
        </div>

        <details className="mt-4 rounded-md border bg-muted/30">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-foreground">
            {t("actions.details", "Diagnostic information", locale)}
          </summary>
          <div className="border-t p-3">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">
              {diagnostic}
            </pre>
            <button
              type="button"
              className={`${secondaryButton} mt-3`}
              onClick={async () => {
                try {
                  await copyPortalDiagnostic(diagnostic);
                  setCopyStatus("copied");
                } catch {
                  setCopyStatus("failed");
                }
              }}
            >
              {copyStatus === "copied" ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copyStatus === "copied"
                ? t("actions.copied", "Copied", locale)
                : copyStatus === "failed"
                  ? t("actions.copyFailed", "Copy failed", locale)
                  : t(
                      "actions.copyDetails",
                      "Copy diagnostic information",
                      locale
                    )}
            </button>
          </div>
        </details>

        {(onRetry || onLogout) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {onRetry && (
              <button
                type="button"
                className={primaryButton}
                disabled={retrying}
                onClick={() => void onRetry()}
              >
                <RefreshCcw
                  className={`size-4 ${retrying ? "animate-spin" : ""}`}
                />
                {t("actions.retry", "Try again", locale)}
              </button>
            )}
            {onLogout && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => void onLogout()}
              >
                <LogOut className="size-4" />
                {t("actions.signOut", "Sign out", locale)}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

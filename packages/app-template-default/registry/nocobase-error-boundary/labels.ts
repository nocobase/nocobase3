import { translate } from "@nocobase/portal-sdk/i18n";

import { NOCOBASE_ERROR_BOUNDARY_I18N_NAMESPACE } from "./locales";

export type ErrorBoundaryLabels = {
  backHome: string;
  copied: string;
  copyFailed: string;
  copyDetails: string;
  description: string;
  details: string;
  reload: string;
  retry: string;
  title: string;
};

const defaults: Record<keyof ErrorBoundaryLabels, string> = {
  title: "Something went wrong",
  description:
    "This part of the application could not be displayed. Copy the diagnostic information if you need help.",
  details: "Diagnostic information",
  copyDetails: "Copy diagnostic information",
  copied: "Copied",
  copyFailed: "Copy failed",
  retry: "Try again",
  reload: "Reload page",
  backHome: "Back to homepage",
};

const keys: Record<keyof ErrorBoundaryLabels, string> = {
  title: "boundary.title",
  description: "boundary.description",
  details: "actions.details",
  copyDetails: "actions.copyDetails",
  copied: "actions.copied",
  copyFailed: "actions.copyFailed",
  retry: "actions.retry",
  reload: "actions.reload",
  backHome: "actions.backHome",
};

export function getErrorBoundaryLabels(
  locale?: string,
  overrides: Partial<ErrorBoundaryLabels> = {}
): ErrorBoundaryLabels {
  const translated = Object.fromEntries(
    (Object.keys(keys) as Array<keyof ErrorBoundaryLabels>).map((name) => [
      name,
      translate(
        keys[name],
        {
          ns: NOCOBASE_ERROR_BOUNDARY_I18N_NAMESPACE,
          ...(locale ? { lng: locale } : {}),
        },
        defaults[name]
      ),
    ])
  ) as ErrorBoundaryLabels;

  return { ...translated, ...overrides };
}

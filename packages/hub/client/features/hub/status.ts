import type {
  HubApplicationStatus,
  HubDeploymentStatus,
  HubReleaseVerificationStatus,
} from "./api";

export type HubStatusVariant =
  "default" | "secondary" | "outline" | "destructive";

const labels: Record<string, string> = {
  active: "Active",
  archived: "Archived",
  disabled: "Disabled",
  pending: "Pending verification",
  verified: "Verified",
  rejected: "Rejected",
  queued: "Queued",
  preparing: "Preparing",
  activating: "Starting runtime",
  checking: "Checking health",
  switching: "Switching traffic",
  draining: "Draining old runtime",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function getStatusLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return (
    labels[value] ??
    value.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export function getStatusVariant(
  value: string | null | undefined,
): HubStatusVariant {
  switch (value) {
    case "failed":
    case "rejected":
    case "disabled":
      return "destructive";
    case "succeeded":
    case "verified":
    case "active":
      return "default";
    case "queued":
    case "pending":
    case "preparing":
    case "checking":
      return "secondary";
    default:
      return "outline";
  }
}

export function getDeploymentProgress(status: HubDeploymentStatus): {
  percent: number;
  label: string;
} {
  const percentages: Record<string, number> = {
    queued: 10,
    preparing: 25,
    activating: 45,
    checking: 60,
    switching: 75,
    draining: 88,
    succeeded: 100,
    failed: 100,
    cancelled: 100,
  };
  return {
    percent: percentages[status] ?? 0,
    label: getStatusLabel(status),
  };
}

export function statusLabelForApplication(value: HubApplicationStatus): string {
  return getStatusLabel(value);
}

export function statusLabelForRelease(
  value: HubReleaseVerificationStatus,
): string {
  return getStatusLabel(value);
}

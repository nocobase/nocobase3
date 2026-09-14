/**
 * Stand-ins for records a real child page would load. They exist so the detail page has a name that comes from its
 * data rather than from its route, which is what `usePageTitle` is for.
 */
export interface RouteChildPageRecord {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
}

export const routeChildPageRecords: readonly RouteChildPageRecord[] = [
  {
    id: 'quotation',
    name: 'routeOverlays.recordQuotation',
    summary: 'routeOverlays.recordQuotationSummary',
  },
  {
    id: 'onboarding',
    name: 'routeOverlays.recordOnboarding',
    summary: 'routeOverlays.recordOnboardingSummary',
  },
  {
    id: 'renewal',
    name: 'routeOverlays.recordRenewal',
    summary: 'routeOverlays.recordRenewalSummary',
  },
];

export function findRouteChildPageRecord(
  id: string | undefined,
): RouteChildPageRecord | undefined {
  return routeChildPageRecords.find((record) => record.id === id);
}

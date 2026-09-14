/**
 * The child pages reachable from the nested pages index.
 *
 * They are three different kinds of page rather than three rows of one collection, so each is its own route with
 * its own title. The titles here repeat the ones declared in `client/routes.ts`, where they name the route itself.
 * Keying them by path segment is what lets each page pick its own out without a lookup that could miss.
 */
export interface RouteChildPageTopic {
  readonly name: string;
  readonly summary: string;
  /** Whether this page owns a dialog child route, used to show that an overlay adds no breadcrumb level. */
  readonly overlay?: boolean;
}

export const routeChildPageTopics = {
  quotation: {
    name: 'routeOverlays.topicQuotation',
    summary: 'routeOverlays.topicQuotationSummary',
    overlay: true,
  },
  onboarding: {
    name: 'routeOverlays.topicOnboarding',
    summary: 'routeOverlays.topicOnboardingSummary',
  },
  renewal: {
    name: 'routeOverlays.topicRenewal',
    summary: 'routeOverlays.topicRenewalSummary',
  },
} as const satisfies Record<string, RouteChildPageTopic>;

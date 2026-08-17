export type RouteSurfaceScenarioId =
  | "drawer"
  | "dialog"
  | "page"
  | "nested-drawers"
  | "page-drawer-dialog"
  | "contextual-child-routes";

export type RouteSurfaceScenario = {
  id: RouteSurfaceScenarioId;
  number: string;
  title: string;
  description: string;
  path: string;
  routeShape: string;
};

export const routeSurfaceScenarios: RouteSurfaceScenario[] = [
  {
    id: "drawer",
    number: "1",
    title: "Drawer route",
    description:
      "Keep the current page mounted and open one URL-backed drawer.",
    path: "drawer",
    routeShape: "Page → Drawer",
  },
  {
    id: "dialog",
    number: "2",
    title: "Dialog route",
    description:
      "Open focused content in a modal while preserving the page URL history.",
    path: "dialog",
    routeShape: "Page → Dialog",
  },
  {
    id: "page",
    number: "3",
    title: "Child page",
    description:
      "Replace the current page instead of rendering the child inside an overlay.",
    path: "page",
    routeShape: "Page → Child page",
  },
  {
    id: "nested-drawers",
    number: "4",
    title: "Second-level drawer",
    description:
      "Push the lower drawer outward and keep the top drawer at a stable size.",
    path: "drawer/second",
    routeShape: "Page → Drawer → Drawer",
  },
  {
    id: "page-drawer-dialog",
    number: "5",
    title: "Page, drawer, and dialog",
    description:
      "Compose different presentation types without coupling business content to them.",
    path: "page/drawer/dialog",
    routeShape: "Child page → Drawer → Dialog",
  },
  {
    id: "contextual-child-routes",
    number: "6",
    title: "Contextual child routes",
    description:
      "Open the same create, edit, and detail surfaces from a list or detail context without leaving the current workflow.",
    path: "contextual",
    routeShape: "List → Detail → Edit",
  },
];

export function getRouteSurfacePrompt(
  scenario: RouteSurfaceScenario,
  target: string
) {
  const presentation = {
    drawer:
      "Keep the current page mounted and open the target content with RouteDrawer. Closing the drawer returns to the page route.",
    dialog:
      "Keep the current page mounted and open the target content with RouteDialog. The dialog route must be directly addressable and dismissible through the shared close lifecycle.",
    page: "Render the target content as a real child page with RoutePage. Register it as a page route branch rather than placing it inside a drawer outlet.",
    "nested-drawers":
      "Create a parent RouteDrawer with an Outlet and pass the rendered child outlet through its nested prop. The second RouteDrawer must push the lower drawer outward, keep equal widths, and close back to the parent route.",
    "page-drawer-dialog":
      "Render a RoutePage first, place a RouteDrawer route inside that page, then render a RouteDialog as the drawer's nested route. Closing each layer must return to the immediately lower URL.",
    "contextual-child-routes":
      "Define the list as the host route and register create, edit, and show as relative child routes. Reuse the same business surface from both list and detail contexts, but keep each URL under the route that opened it. Do not navigate to a fixed top-level resource URL from a child context.",
  }[scenario.id];

  return `Build ${
    target || "the requested workflow"
  } with the installed NocoBase route surfaces.

Scenario:
- ${scenario.routeShape}
- ${presentation}

Implementation requirements:
- Import RouteDrawer, RouteDialog, and RoutePage from @/extensions/nocobase-route-surfaces; import useRouteSurfaceClose from @nocobase/portal-sdk/routing when actions need to close the active surface.
- Define application-owned resource routes once with defineAppRoutes. resourceAction only binds a child path to the parent Refine resource's create, edit, or show URL; it does not choose a presentation.
- With the default automatic resource outlet, every resourceAction element must render a RouteDrawer or RouteDialog. Never place a plain full-page form or detail component there because it will render below the list.
- When a resource action must replace the list as a full page, set outlet: "manual" on the resource route and use an application-owned layout that renders or consumes useOutlet().
- Keep data loading, forms, ACL guards, route paths, and business copy in application-owned files.
- Keep business content independent from its presentation container so the same content can move between a drawer, dialog, or page.
- Every surface must have an explicit closeTo URL.
- Use nested React Router routes and Outlet only when the visual layer is genuinely nested.
- Treat create, edit, show, and related-content overlays as contextual child routes. Use relative paths and navigation from the current host route; do not use a fixed absolute URL that moves the user to another resource page.
- Reuse business content across hosts, but let each host route own its child surface and closeTo URL. A resource name alone is not enough to select the correct presentation URL.
- When opening a contextual child, preserve the complete host URL, including search and hash, in navigation state. Use it as closeTo and fall back to the resolved parent route for direct URL entry.
- A full child page must be a page route branch, not an Outlet rendered inside a drawer.
- For editable forms, use useRefineUnsavedChangesGuard, pass its beforeClose callback to the surface, render its confirmation node, and use useRouteSurfaceClose for Cancel and successful submission.
- Direct URL entry, refresh, browser back/forward, Escape, the close button, and backdrop dismissal must all restore the correct layer stack.
- Verify visually that no resource action page is appended below its parent list.
- Apply Refine CanAccess with an AccessDenied fallback to each business resource/action independently; do not rely on a parent list permission for unrelated child pages.

Deliver the complete route definitions and React components using the application's existing design system.`;
}

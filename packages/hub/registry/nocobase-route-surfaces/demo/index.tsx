import { ArrowLeft, ArrowRight, Eye, Layers3, Pencil, Plus } from "lucide-react";
import { useCallback, useRef } from "react";
import {
  buildRouteLocationHref,
  createRouteSurfaceNavigationState,
  resolveRouteSurfaceCloseTo,
  useRouteSurfaceClose,
} from "@nocobase/portal-sdk/routing";
import {
  useLocation,
  useNavigate,
  useOutlet,
  useParams,
  useResolvedPath,
} from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  RouteDialog,
  RouteDrawer,
  RoutePage,
} from "../index";
import { RouteSurfacePromptGenerator } from "./prompt-generator";
import { ResourceActionGuide } from "./resource-action-guide";
import { routeSurfaceScenarios } from "./scenarios";

const routeSurfaceRoot = "/route-surfaces";

function useRouteSurfaceDemoBase() {
  const { pathname } = useLocation();
  const rootIndex = pathname.indexOf(routeSurfaceRoot);

  return rootIndex >= 0
    ? pathname.slice(0, rootIndex + routeSurfaceRoot.length)
    : routeSurfaceRoot;
}

function useOpenContextualChild() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (to: string) =>
      navigate(to, {
        state: createRouteSurfaceNavigationState(location),
      }),
    [location, navigate]
  );
}

function useContextualCloseTo() {
  const location = useLocation();
  const parent = useResolvedPath("..");
  const closeTo = useRef(
    resolveRouteSurfaceCloseTo(location.state, parent)
  );

  return closeTo.current;
}

export function RouteSurfacesDemoHome() {
  const navigate = useNavigate();
  const overlay = useOutlet();

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="secondary">Route surfaces</Badge>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            URL-backed pages and overlays
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Keep business content independent from whether it appears as a page,
            drawer, dialog, or nested combination. Every preview below supports
            a direct URL and browser history.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {routeSurfaceScenarios.map((scenario) => (
            <Card key={scenario.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline">Scenario {scenario.number}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {scenario.routeShape}
                  </span>
                </div>
                <CardTitle>{scenario.title}</CardTitle>
                <CardDescription>{scenario.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(scenario.path)}
                >
                  Open preview
                  <ArrowRight />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <ResourceActionGuide />

        <RouteSurfacePromptGenerator />
      </div>
      {overlay}
    </>
  );
}

export function DemoDrawerRoute() {
  const navigate = useNavigate();
  const nested = useOutlet();
  const demoBase = useRouteSurfaceDemoBase();

  return (
    <RouteDrawer
      title="Customer details"
      description="A routed drawer keeps the scenario page mounted behind it."
      closeLabel="Close"
      closeTo={demoBase}
      nested={nested}
    >
      <DemoSurfaceBody
        label="Drawer"
        title="Northwind renewal"
        description="Business content does not know that it is rendered inside a drawer."
      >
        <Button onClick={() => navigate("second")}>
          Open second-level drawer
          <ArrowRight />
        </Button>
      </DemoSurfaceBody>
    </RouteDrawer>
  );
}

export function DemoSecondDrawerRoute() {
  const demoBase = useRouteSurfaceDemoBase();

  return (
    <RouteDrawer
      title="Renewal activity"
      description="The lower drawer is pushed outward and remains behind the layer mask."
      closeLabel="Close"
      closeTo={`${demoBase}/drawer`}
    >
      <DemoSurfaceBody
        label="Second-level drawer"
        title="Latest review"
        description="Clicking this layer's backdrop closes only the top drawer."
      />
    </RouteDrawer>
  );
}

export function DemoDialogRoute() {
  const demoBase = useRouteSurfaceDemoBase();

  return (
    <RouteDialog
      title="Approve renewal"
      description="A modal route for a focused decision."
      closeLabel="Close"
      closeTo={demoBase}
    >
      <DemoSurfaceBody
        label="Dialog"
        title="Approval required"
        description="The page stays mounted while the URL represents the active dialog."
      />
    </RouteDialog>
  );
}

export function DemoPageRoute() {
  const nested = useOutlet();
  const demoBase = useRouteSurfaceDemoBase();

  return (
    <RoutePage closeTo={demoBase}>
      <DemoPageContent nested={nested} />
    </RoutePage>
  );
}

function DemoPageContent({ nested }: { nested: React.ReactNode }) {
  const close = useRouteSurfaceClose();
  const navigate = useNavigate();

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Badge variant="secondary">Child page</Badge>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              Customer workspace
            </h1>
            <p className="text-muted-foreground">
              This route replaces the Demo home instead of rendering inside its
              Outlet.
            </p>
          </div>
          <Button variant="outline" onClick={() => void close()}>
            <ArrowLeft />
            Back to scenarios
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers3 className="size-5 text-primary" />
              <CardTitle>Page-owned workflow</CardTitle>
            </div>
            <CardDescription>
              A page can still host routed overlays without becoming coupled to
              their content.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("drawer")}>Open page drawer</Button>
          </CardContent>
        </Card>
      </div>
      {nested}
    </>
  );
}

export function DemoPageDrawerRoute() {
  const navigate = useNavigate();
  const nested = useOutlet();
  const demoBase = useRouteSurfaceDemoBase();

  return (
    <RouteDrawer
      title="Customer activity"
      description="This drawer belongs to the child page route."
      closeLabel="Close"
      closeTo={`${demoBase}/page`}
      nested={nested}
    >
      <DemoSurfaceBody
        label="Page drawer"
        title="Renewal conversation"
        description="Open a dialog above this drawer to test mixed presentation types."
      >
        <Button onClick={() => navigate("dialog")}>
          Open confirmation dialog
          <ArrowRight />
        </Button>
      </DemoSurfaceBody>
    </RouteDrawer>
  );
}

export function DemoPageDrawerDialogRoute() {
  const demoBase = useRouteSurfaceDemoBase();

  return (
    <RouteDialog
      title="Confirm follow-up"
      description="The dialog is nested in the drawer route subtree."
      closeLabel="Close"
      closeTo={`${demoBase}/page/drawer`}
    >
      <DemoSurfaceBody
        label="Nested dialog"
        title="Schedule a follow-up?"
        description="Closing returns to the drawer; closing the drawer then returns to the page."
      />
    </RouteDialog>
  );
}

export function DemoContextualHomeRoute() {
  const demoBase = useRouteSurfaceDemoBase();
  const nested = useOutlet();
  const navigate = useNavigate();

  return (
    <RoutePage closeTo={demoBase}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Badge variant="secondary">Contextual child routes</Badge>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              One surface, multiple host contexts
            </h1>
            <p className="max-w-3xl text-muted-foreground">
              Create, edit, and detail routes stay under the page that opened
              them. The same form and detail content can be reused without
              sending the user to another resource page.
            </p>
          </div>
          <Button variant="outline" onClick={() => void navigate(demoBase)}>
            <ArrowLeft />
            Back to scenarios
          </Button>
        </div>

        {!nested ? (
          <Card>
            <CardHeader>
              <CardTitle>Choose a host page</CardTitle>
              <CardDescription>
                The list owns its child routes. Open the list preview to test
                create, edit, detail, and detail-to-edit navigation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => navigate("list?status=renewal&page=2")}
              >
                Open customer list
                <ArrowRight />
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {nested}
      </div>
    </RoutePage>
  );
}

export function DemoContextualListRoute() {
  const nested = useOutlet();
  const openChild = useOpenContextualChild();
  const location = useLocation();

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers3 className="size-5 text-primary" />
            <CardTitle>Customer list host</CardTitle>
          </div>
          <CardDescription>
            These actions use relative child navigation. The list remains the
            host when a surface opens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="font-medium">Northwind renewal</div>
            <div className="text-sm text-muted-foreground">
              Current route: {buildRouteLocationHref(location)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => openChild("create")}>
              <Plus />
              Create
            </Button>
            <Button variant="outline" onClick={() => openChild("edit/42")}>
              <Pencil />
              Edit from list
            </Button>
            <Button
              variant="outline"
              onClick={() => openChild("detail/42")}
            >
              <Eye />
              Open detail
            </Button>
          </div>
        </CardContent>
      </Card>
      {nested}
    </>
  );
}

export function DemoContextualDetailRoute() {
  const nested = useOutlet();
  const openChild = useOpenContextualChild();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const closeTo = useContextualCloseTo();

  return (
    <RouteDrawer
      title="Customer details"
      description="The detail surface is nested under the list host."
      closeLabel="Close"
      closeTo={closeTo}
      nested={nested}
    >
      <DemoSurfaceBody
        label="Detail child route"
        title={`Northwind renewal #${id ?? "42"}`}
        description={`Current route: ${buildRouteLocationHref(location)}`}
      >
        <Button onClick={() => openChild("edit")}>
          <Pencil />
          Edit from detail
        </Button>
      </DemoSurfaceBody>
    </RouteDrawer>
  );
}

export function DemoContextualCreateRoute() {
  return <DemoContextualFormRoute mode="create" />;
}

export function DemoContextualEditRoute() {
  return <DemoContextualFormRoute mode="edit" />;
}

function DemoContextualFormRoute({ mode }: { mode: "create" | "edit" }) {
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const closeTo = useContextualCloseTo();

  return (
    <RouteDrawer
      title={mode === "create" ? "Create customer" : "Edit customer"}
      description="The same form surface can be hosted by different parent routes."
      closeLabel="Close"
      closeTo={closeTo}
    >
      <DemoSurfaceBody
        label={mode === "create" ? "Create child route" : "Edit child route"}
        title={
          mode === "create"
            ? "New customer"
            : `Northwind renewal #${id ?? "42"}`
        }
        description={`Current route: ${buildRouteLocationHref(location)}`}
      >
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          The parent route remains mounted while this reusable form is shown.
        </div>
      </DemoSurfaceBody>
    </RouteDrawer>
  );
}

function DemoSurfaceBody({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <div className="space-y-5">
        <Badge variant="outline">{label}</Badge>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
          <DemoField label="Owner" value="Ada Lovelace" />
          <DemoField label="Status" value="In review" />
          <DemoField label="Value" value="$48,000" />
          <DemoField label="Renewal" value="September 30" />
        </div>
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

function DemoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, Boxes, LayoutPanelTop } from "lucide-react";
import { useState } from "react";

import {
  NocoBaseErrorBoundary,
  NocoBaseRuntimeStatus,
  useErrorBoundary,
} from "../index";

function RenderFailure({ active, label }: { active: boolean; label: string }) {
  if (active) {
    throw new Error(`${label} render failed with token=demo-secret`);
  }
  return null;
}

function ScenarioContent({
  description,
  onRenderFailure,
}: {
  description: string;
  onRenderFailure: () => void;
}) {
  const { showBoundary } = useErrorBoundary();

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" onClick={onRenderFailure}>
          Trigger render error
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void Promise.resolve()
              .then(() => {
                throw new Error(
                  "An asynchronous renderer failed with access_token=demo-secret"
                );
              })
              .catch(showBoundary);
          }}
        >
          Forward async error
        </Button>
      </div>
    </div>
  );
}

function BoundaryScenario({
  description,
  label,
  variant,
}: {
  description: string;
  label: string;
  variant: "page" | "region";
}) {
  const [renderFailure, setRenderFailure] = useState(false);

  return (
    <NocoBaseErrorBoundary
      variant={variant}
      onReset={() => setRenderFailure(false)}
      context={{
        route: `/dev/error-boundary?scenario=${variant}&token=demo-secret`,
        templateName: __PORTAL_TEMPLATE_NAME__,
        templateVersion: __PORTAL_TEMPLATE_VERSION__,
      }}
    >
      <RenderFailure active={renderFailure} label={label} />
      <ScenarioContent
        description={description}
        onRenderFailure={() => setRenderFailure(true)}
      />
    </NocoBaseErrorBoundary>
  );
}

function RootBoundaryPreview({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background">
      <NocoBaseErrorBoundary variant="root" onReset={onClose}>
        <RenderFailure active label="Root provider" />
      </NocoBaseErrorBoundary>
    </div>
  );
}

const runtimeScenarios = [
  {
    code: "APP_PREPARING",
    label: "Preparing",
    message: "application main is preparing, please wait patiently",
    status: 503,
    maintaining: true,
  },
  {
    code: "APP_COMMANDING",
    label: "Upgrading",
    message: "upgrading plugins...",
    status: 503,
    maintaining: true,
    command: { name: "upgrade" },
  },
  {
    code: "APP_STOPPED",
    label: "Stopped",
    message: "application main is stopped",
    status: 503,
    maintaining: true,
  },
  {
    code: "APP_ERROR",
    label: "App error",
    message: "Failed to start the application",
    status: 503,
    maintaining: true,
  },
  {
    code: "USER_HAS_NO_ROLES_ERR",
    label: "No roles",
    message: "The current user has no roles. Please try another account.",
    status: 401,
  },
  {
    code: undefined,
    label: "Proxy 503",
    message: "Service Unavailable",
    status: 503,
  },
  {
    code: undefined,
    label: "Proxy 504",
    message: "Gateway Timeout",
    status: 504,
  },
] as const;

function RuntimeStatusPreview({
  index,
  onClose,
}: {
  index: number;
  onClose: () => void;
}) {
  const scenario = runtimeScenarios[index];
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background">
      <NocoBaseRuntimeStatus
        error={{ ...scenario, source: "http" }}
        onRetry={onClose}
        onLogout={scenario.code === "USER_HAS_NO_ROLES_ERR" ? onClose : undefined}
        context={{
          route: "/dev/error-boundary",
          templateName: __PORTAL_TEMPLATE_NAME__,
          templateVersion: __PORTAL_TEMPLATE_VERSION__,
        }}
      />
    </div>
  );
}

export default function ErrorBoundaryDemo() {
  const [rootPreview, setRootPreview] = useState(false);
  const [runtimePreview, setRuntimePreview] = useState<number>();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Badge variant="secondary">Error containment</Badge>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Recover without a blank screen
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Root, page, and region failures use one diagnostic format. Trigger a
          failure, copy its redacted details, then retry to restore only the
          affected surface.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Boxes className="size-4" /> Region boundary
            </div>
            <CardTitle>Independent renderer</CardTitle>
            <CardDescription>
              Best for charts, AI results, plugin surfaces, and third-party widgets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BoundaryScenario
              variant="region"
              label="Chart region"
              description="Only this card is replaced when its renderer fails. The rest of the page remains interactive."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LayoutPanelTop className="size-4" /> Page boundary
            </div>
            <CardTitle>Routed page content</CardTitle>
            <CardDescription>
              The application header and navigation remain available after a page failure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BoundaryScenario
              variant="page"
              label="Customer page"
              description="The page fallback is roomier, but uses the same copyable diagnostics and reset lifecycle."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="size-4" /> Root boundary
          </div>
          <CardTitle>Bootstrap and provider failures</CardTitle>
          <CardDescription>
            Preview the full-screen fallback used when the application shell cannot render.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => setRootPreview(true)}>
            Preview root failure
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="size-4" /> Runtime status
          </div>
          <CardTitle>Gateway and account states</CardTitle>
          <CardDescription>
            Preview the original NocoBase error codes received over HTTP and WebSocket.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {runtimeScenarios.map((scenario, index) => (
            <Button
              key={scenario.label}
              type="button"
              variant="outline"
              onClick={() => setRuntimePreview(index)}
            >
              {scenario.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      {rootPreview && <RootBoundaryPreview onClose={() => setRootPreview(false)} />}
      {runtimePreview !== undefined && (
        <RuntimeStatusPreview index={runtimePreview} onClose={() => setRuntimePreview(undefined)} />
      )}
    </div>
  );
}

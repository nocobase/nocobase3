import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock3,
  RotateCcw,
  Server,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import {
  type HubDeployment,
  type HubDeploymentEvent,
  type HubFetcher,
  type HubMe,
  hasHubCapability,
  hubPost,
  useHubQuery,
} from "@/features/hub/api";
import {
  formatHubDate,
  HubEmptyState,
  HubErrorState,
  HubLoadingState,
  HubNotFoundState,
  HubStatusBadge,
} from "@/features/hub/components";
import { getDeploymentProgress, getStatusLabel } from "@/features/hub/status";
import { useOptionalHubRuntime } from "@/features/hub/provider";

export interface DeploymentDetailPageProps {
  deploymentId?: string;
  fetcher?: HubFetcher;
  onRedeploy?: (deployment: HubDeployment) => void;
}

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

export function DeploymentDetailPage({
  deploymentId: deploymentIdProp,
  fetcher,
  onRedeploy,
}: DeploymentDetailPageProps) {
  const params = useParams<{ deploymentId?: string }>();
  const navigate = useNavigate();
  const deploymentId = deploymentIdProp ?? params.deploymentId;
  const encodedId = deploymentId ? encodeURIComponent(deploymentId) : null;
  const deployment = useHubQuery<HubDeployment>({
    path: encodedId ? `/deployments/${encodedId}` : null,
    fetcher,
  });
  const events = useHubQuery<HubDeploymentEvent[]>({
    path: encodedId ? `/deployments/${encodedId}/events` : null,
    fetcher,
    initialData: [],
    transform: (value) =>
      [...value].sort((left, right) => left.sequence - right.sequence),
  });
  const runtime = useOptionalHubRuntime();
  const me = useHubQuery<HubMe>({
    path: encodedId && !runtime ? "/me" : null,
    fetcher,
    enabled: Boolean(encodedId && !runtime),
  });
  const canRedeploy = hasHubCapability(
    runtime?.me.capabilities ?? me.data?.capabilities,
    "hub.deployment",
    "create",
    deployment.data?.applicationId,
  );
  const capabilities = runtime?.me.capabilities ?? me.data?.capabilities;
  const deploymentStatus = deployment.data?.status;
  const reloadDeployment = deployment.reload;
  const reloadEvents = events.reload;
  const [redeployOpen, setRedeployOpen] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [redeployError, setRedeployError] = useState<Error | null>(null);

  useEffect(() => {
    if (!deploymentStatus || TERMINAL_STATUSES.has(deploymentStatus)) return;
    const timer = window.setInterval(() => {
      reloadDeployment();
      reloadEvents();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [deploymentStatus, reloadDeployment, reloadEvents]);

  if (!deploymentId) return <HubNotFoundState kind="Deployment" />;
  if (deployment.loading) return <HubLoadingState label="Loading deployment" />;
  if (deployment.error) {
    return (
      <HubErrorState
        error={deployment.error}
        onRetry={deployment.reload}
        title="Unable to load deployment"
      />
    );
  }
  if (!deployment.data) return <HubNotFoundState kind="Deployment" />;
  const deploymentData = deployment.data;
  const canReadGlobalDeployments = hasHubCapability(
    capabilities,
    "hub.deployment",
    "read",
  );
  const canReadApplication = hasHubCapability(
    capabilities,
    "hub.app",
    "read",
    deploymentData.applicationId,
  );
  const backTarget = canReadGlobalDeployments
    ? { label: "Deployments", to: "/deployments" }
    : canReadApplication
      ? {
          label: "Application",
          to: `/apps/${encodeURIComponent(deploymentData.applicationId)}`,
        }
      : { label: "Home", to: "/" };

  const progress = getDeploymentProgress(deploymentData.status);
  const failure =
    deploymentData.failure ??
    (deploymentData.failureCode || deploymentData.failureMessage
      ? {
          code: deploymentData.failureCode ?? "DEPLOYMENT_FAILED",
          message: deploymentData.failureMessage ?? "Deployment failed.",
        }
      : null);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to={backTarget.to} />}
        >
          <ArrowLeft aria-hidden="true" />
          {backTarget.label}
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                Deployment {deploymentData.id}
              </h1>
              <HubStatusBadge status={deploymentData.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {deploymentData.type} to {deploymentData.environmentId}
            </p>
          </div>
          {canRedeploy && TERMINAL_STATUSES.has(deploymentData.status) ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (onRedeploy) {
                  onRedeploy(deploymentData);
                } else {
                  setRedeployError(null);
                  setRedeployOpen(true);
                }
              }}
            >
              <RotateCcw aria-hidden="true" />
              Redeploy
            </Button>
          ) : null}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Deployment progress</CardTitle>
          <CardDescription aria-live="polite">
            {progress.label}. Event history refreshes while the deployment is
            running.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={progress.percent}>
            <ProgressLabel>{progress.label}</ProgressLabel>
            <span className="ml-auto text-sm tabular-nums text-muted-foreground">
              {progress.percent}%
            </span>
          </Progress>
        </CardContent>
      </Card>

      {failure ? (
        <Alert variant="destructive">
          <Activity aria-hidden="true" />
          <AlertTitle>{failure.code}</AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Event timeline</CardTitle>
            <CardDescription>
              Persisted stages reported by the Hub deployment orchestrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {events.error ? (
              <HubErrorState
                error={events.error}
                onRetry={events.reload}
                title="Unable to load events"
              />
            ) : events.loading ? (
              <HubLoadingState label="Loading deployment events" />
            ) : (events.data?.length ?? 0) === 0 ? (
              <HubEmptyState
                title="Waiting for events"
                description="The orchestrator has not persisted an execution event yet."
              />
            ) : (
              <DeploymentTimeline events={events.data ?? []} />
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Operation details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm">
              <Detail
                label="Application"
                value={deploymentData.applicationId}
              />
              <Detail
                label="Target release"
                value={deploymentData.targetReleaseId}
                mono
              />
              <Detail
                label="Previous release"
                value={deploymentData.previousReleaseId ?? "None"}
                mono
              />
              <Detail
                label="Environment"
                value={deploymentData.environmentId}
              />
              <Detail label="Requested by" value={deploymentData.requestedBy} />
              <Detail
                label="Started"
                value={formatHubDate(deploymentData.startedAt)}
              />
              <Detail
                label="Finished"
                value={formatHubDate(deploymentData.finishedAt)}
              />
              <Detail
                label="Host operation"
                value={deploymentData.hostOperationId ?? "—"}
                mono
              />
            </dl>
          </CardContent>
        </Card>
      </div>
      <AlertDialog
        open={redeployOpen}
        onOpenChange={(open) => {
          if (!open && !redeploying) {
            setRedeployOpen(false);
            setRedeployError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redeploy release</AlertDialogTitle>
            <AlertDialogDescription>
              Create a new Deployment for release{" "}
              {deploymentData.targetReleaseId} in {deploymentData.environmentId}
              . The existing record remains unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {redeployError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to redeploy release</AlertTitle>
              <AlertDescription>{redeployError.message}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={redeploying}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={redeploying}
              onClick={(event) => {
                event.preventDefault();
                setRedeploying(true);
                setRedeployError(null);
                void hubPost<HubDeployment>(
                  `/apps/${encodeURIComponent(
                    deploymentData.applicationId,
                  )}/deployments`,
                  {
                    targetReleaseId: deploymentData.targetReleaseId,
                    type: "redeploy",
                  },
                  fetcher,
                )
                  .then((result) => {
                    setRedeployOpen(false);
                    void navigate(`/deployments/${result.data.id}`);
                  })
                  .catch((reason: unknown) => {
                    setRedeployError(
                      reason instanceof Error
                        ? reason
                        : new Error(String(reason)),
                    );
                  })
                  .finally(() => setRedeploying(false));
              }}
            >
              {redeploying ? "Starting…" : "Confirm redeploy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeploymentTimeline({ events }: { events: HubDeploymentEvent[] }) {
  return (
    <ol className="relative space-y-0" aria-label="Deployment events">
      {events.map((event, index) => {
        const complete = event.status === "succeeded";
        return (
          <li
            key={event.id}
            className="relative grid grid-cols-[1.5rem_1fr] gap-3 pb-6 last:pb-0"
          >
            {index < events.length - 1 ? (
              <span
                className="absolute top-5 bottom-0 left-[0.6875rem] w-px bg-border"
                aria-hidden="true"
              />
            ) : null}
            <span className="relative z-10 mt-0.5 flex size-6 items-center justify-center rounded-full border bg-background">
              {complete ? (
                <CheckCircle2
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  className="size-3 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {event.message ?? getStatusLabel(event.type)}
                </p>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={event.createdAt}
                >
                  {formatHubDate(event.createdAt)}
                </time>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{getStatusLabel(event.status)}</span>
                {event.hostId ? (
                  <span className="inline-flex items-center gap-1">
                    <Server className="size-3" aria-hidden="true" />
                    {event.hostId}
                  </span>
                ) : null}
                {event.runtimeId ? (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Clock3 className="size-3" aria-hidden="true" />
                    {event.runtimeId}
                  </span>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          mono ? "break-all font-mono text-xs" : "break-words font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}

export default DeploymentDetailPage;

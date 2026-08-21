import { Activity, ArrowLeft, Boxes, GitCommit, Rocket } from "lucide-react";
import { useMemo, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type HubApplication,
  type HubDeployment,
  type HubFetcher,
  type HubMe,
  type HubRelease,
  hasHubCapability,
  hubPost,
  useHubQuery,
} from "@/features/hub/api";
import {
  formatHubBytes,
  formatHubDate,
  HubEmptyState,
  HubErrorState,
  HubLoadMore,
  HubLoadingState,
  HubNotFoundState,
  HubStatusBadge,
} from "@/features/hub/components";
import { useHubPaginatedQuery } from "@/features/hub/pagination";
import { useOptionalHubRuntime } from "@/features/hub/provider";

export interface ApplicationDetailPageProps {
  applicationId?: string;
  fetcher?: HubFetcher;
  onDeployRelease?: (release: HubRelease, application: HubApplication) => void;
}

export function ApplicationDetailPage({
  applicationId: applicationIdProp,
  fetcher,
  onDeployRelease,
}: ApplicationDetailPageProps) {
  const params = useParams<{ appId?: string; applicationId?: string }>();
  const navigate = useNavigate();
  const applicationId =
    applicationIdProp ?? params.appId ?? params.applicationId;
  const encodedId = applicationId ? encodeURIComponent(applicationId) : null;
  const application = useHubQuery<HubApplication>({
    path: encodedId ? `/apps/${encodedId}` : null,
    fetcher,
  });
  const runtime = useOptionalHubRuntime();
  const me = useHubQuery<HubMe>({
    path: encodedId && !runtime ? "/me" : null,
    fetcher,
    enabled: Boolean(encodedId && !runtime),
  });
  const capabilities = runtime?.me.capabilities ?? me.data?.capabilities;
  const canReadReleases = hasHubCapability(
    capabilities,
    "hub.release",
    "read",
    applicationId,
  );
  const canReadDeployments = hasHubCapability(
    capabilities,
    "hub.deployment",
    "read",
    applicationId,
  );
  const releases = useHubPaginatedQuery<HubRelease>({
    path: encodedId ? `/apps/${encodedId}/releases` : null,
    fetcher,
    enabled: canReadReleases,
  });
  const deployments = useHubPaginatedQuery<HubDeployment>({
    path: encodedId ? `/apps/${encodedId}/deployments` : null,
    fetcher,
    enabled: canReadDeployments,
  });
  const canDeploy = hasHubCapability(
    capabilities,
    "hub.deployment",
    "create",
    applicationId,
  );
  const canReadGlobalApplications = hasHubCapability(
    capabilities,
    "hub.app",
    "read",
  );
  const [selectedRelease, setSelectedRelease] = useState<HubRelease | null>(
    null,
  );
  const [submittingDeployment, setSubmittingDeployment] = useState(false);
  const [deploymentError, setDeploymentError] = useState<Error | null>(null);

  const requestDeployment = (release: HubRelease, app: HubApplication) => {
    if (onDeployRelease) {
      onDeployRelease(release, app);
      return;
    }
    setDeploymentError(null);
    setSelectedRelease(release);
  };

  if (!applicationId) return <HubNotFoundState kind="Application" />;
  if (!runtime && me.loading) {
    return <HubLoadingState label="Loading Hub access" />;
  }
  if (!runtime && me.error) {
    return (
      <HubErrorState
        error={me.error}
        onRetry={me.reload}
        title="Unable to load your Hub access"
      />
    );
  }
  if (application.loading)
    return <HubLoadingState label="Loading application" />;
  if (application.error) {
    return (
      <HubErrorState
        error={application.error}
        onRetry={application.reload}
        title="Unable to load application"
      />
    );
  }
  if (!application.data) return <HubNotFoundState kind="Application" />;
  const applicationData = application.data;

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to={canReadGlobalApplications ? "/apps" : "/"} />}
        >
          <ArrowLeft aria-hidden="true" />
          {canReadGlobalApplications ? "Applications" : "Home"}
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                {applicationData.name}
              </h1>
              <HubStatusBadge status={applicationData.status} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {applicationData.slug}
            </p>
            {applicationData.description ? (
              <p className="max-w-2xl text-sm text-muted-foreground">
                {applicationData.description}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList variant="line" aria-label="Application sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {canReadReleases ? (
            <TabsTrigger value="releases">Releases</TabsTrigger>
          ) : null}
          {canReadDeployments ? (
            <TabsTrigger value="deployments">Deployments</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <ApplicationOverview
            application={applicationData}
            releases={releases.data ?? []}
            deployments={deployments.data ?? []}
            releaseTotal={releases.meta?.total}
            canReadReleases={canReadReleases}
            canReadDeployments={canReadDeployments}
          />
        </TabsContent>
        {canReadReleases ? (
          <TabsContent value="releases" className="pt-4">
            <ApplicationReleases
              application={applicationData}
              releases={releases.data ?? []}
              loading={releases.loading}
              error={releases.error}
              onRetry={releases.reload}
              hasMore={releases.hasMore}
              loadingMore={releases.loadingMore}
              onLoadMore={releases.loadMore}
              canDeploy={canDeploy}
              onDeployRelease={requestDeployment}
            />
          </TabsContent>
        ) : null}
        {canReadDeployments ? (
          <TabsContent value="deployments" className="pt-4">
            <ApplicationDeployments
              deployments={deployments.data ?? []}
              releases={releases.data ?? []}
              loading={deployments.loading}
              error={deployments.error}
              onRetry={deployments.reload}
              hasMore={deployments.hasMore}
              loadingMore={deployments.loadingMore}
              onLoadMore={deployments.loadMore}
            />
          </TabsContent>
        ) : null}
      </Tabs>
      <AlertDialog
        open={Boolean(selectedRelease)}
        onOpenChange={(open) => {
          if (!open && !submittingDeployment) {
            setSelectedRelease(null);
            setDeploymentError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {applicationData.activeReleaseId
                ? "Change active release"
                : "Deploy release"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">
                Current release:{" "}
                {releases.data?.find(
                  (release) => release.id === applicationData.activeReleaseId,
                )?.version ??
                  applicationData.activeReleaseId ??
                  "None"}
              </span>
              <span className="block">
                Target release: {selectedRelease?.version ?? "—"}
              </span>
              <span className="block">
                Environment: {applicationData.defaultEnvironmentId}
              </span>
              <span className="mt-2 block">
                This creates a new Deployment. If it fails, the current release
                remains active.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deploymentError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to create deployment</AlertTitle>
              <AlertDescription>{deploymentError.message}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingDeployment}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submittingDeployment || !selectedRelease}
              onClick={(event) => {
                event.preventDefault();
                if (!selectedRelease || !encodedId) return;
                setSubmittingDeployment(true);
                setDeploymentError(null);
                const activeRelease = releases.data?.find(
                  (release) => release.id === applicationData.activeReleaseId,
                );
                const type =
                  activeRelease &&
                  new Date(selectedRelease.createdAt).valueOf() <
                    new Date(activeRelease.createdAt).valueOf()
                    ? "rollback"
                    : "deploy";
                void hubPost<HubDeployment>(
                  `/apps/${encodedId}/deployments`,
                  { targetReleaseId: selectedRelease.id, type },
                  fetcher,
                )
                  .then((result) => {
                    setSelectedRelease(null);
                    void navigate(`/deployments/${result.data.id}`);
                  })
                  .catch((reason: unknown) => {
                    setDeploymentError(
                      reason instanceof Error
                        ? reason
                        : new Error(String(reason)),
                    );
                  })
                  .finally(() => setSubmittingDeployment(false));
              }}
            >
              {submittingDeployment ? "Starting…" : "Confirm deployment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ApplicationOverview({
  application,
  releases,
  deployments,
  releaseTotal,
  canReadReleases,
  canReadDeployments,
}: {
  application: HubApplication;
  releases: HubRelease[];
  deployments: HubDeployment[];
  releaseTotal?: number;
  canReadReleases: boolean;
  canReadDeployments: boolean;
}) {
  const activeRelease = releases.find(
    (release) => release.id === application.activeReleaseId,
  );
  const latestDeployment = useMemo(
    () =>
      [...deployments].sort(
        (left, right) =>
          new Date(right.createdAt).valueOf() -
          new Date(left.createdAt).valueOf(),
      )[0],
    [deployments],
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <OverviewCard
        icon={<Rocket aria-hidden="true" />}
        label="Current release"
        value={
          activeRelease?.version ??
          application.activeReleaseId ??
          "Not deployed"
        }
        detail={
          activeRelease
            ? `Verified ${formatHubDate(activeRelease.createdAt)}`
            : "No active release metadata"
        }
      />
      <OverviewCard
        icon={<Boxes aria-hidden="true" />}
        label="Environment"
        value={application.defaultEnvironmentId}
        detail="MVP deployment target"
      />
      <OverviewCard
        icon={<Activity aria-hidden="true" />}
        label="Latest deployment"
        value={
          canReadDeployments
            ? latestDeployment
              ? latestDeployment.status
              : "No deployments"
            : "Restricted"
        }
        detail={
          !canReadDeployments
            ? "Deployment access not granted"
            : latestDeployment
              ? formatHubDate(latestDeployment.createdAt)
              : "Publish a verified release to begin"
        }
        status={canReadDeployments ? latestDeployment?.status : undefined}
      />
      <OverviewCard
        icon={<GitCommit aria-hidden="true" />}
        label="Available releases"
        value={
          canReadReleases
            ? String(releaseTotal ?? releases.length)
            : "Restricted"
        }
        detail={
          canReadReleases
            ? `Updated ${formatHubDate(application.updatedAt)}`
            : "Release access not granted"
        }
      />
    </div>
  );
}

function OverviewCard({
  icon,
  label,
  value,
  detail,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  status?: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center gap-2 text-muted-foreground [&_svg]:size-4">
          {icon}
          <CardDescription>{label}</CardDescription>
        </div>
        <CardTitle className="flex items-center gap-2 pt-1">
          {status ? <HubStatusBadge status={status} /> : value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {detail}
      </CardContent>
    </Card>
  );
}

function ApplicationReleases({
  application,
  releases,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onLoadMore,
  canDeploy,
  onDeployRelease,
}: {
  application: HubApplication;
  releases: HubRelease[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  canDeploy: boolean;
  onDeployRelease?: (release: HubRelease, application: HubApplication) => void;
}) {
  if (loading) return <HubLoadingState label="Loading releases" />;
  if (error) return <HubErrorState error={error} onRetry={onRetry} />;
  if (releases.length === 0) {
    return (
      <HubEmptyState
        title="No releases"
        description="Upload a SemVer release through the CLI to make it available for deployment."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Version</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {releases.map((release) => {
                const isCurrent = release.id === application.activeReleaseId;
                return (
                  <TableRow key={release.id}>
                    <TableCell className="pl-4 font-medium">
                      <div className="flex items-center gap-2">
                        {release.version}
                        {isCurrent ? (
                          <Badge variant="outline">Current</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <HubStatusBadge status={release.verificationStatus} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {release.sourceCommit ?? "—"}
                    </TableCell>
                    <TableCell>{formatHubBytes(release.sizeBytes)}</TableCell>
                    <TableCell>{formatHubDate(release.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {canDeploy &&
                      onDeployRelease &&
                      release.verificationStatus === "verified" &&
                      !isCurrent ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`Deploy ${release.version}`}
                          onClick={() => onDeployRelease(release, application)}
                        >
                          {application.activeReleaseId
                            ? "Deploy / roll back"
                            : "Deploy"}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <HubLoadMore
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}

function ApplicationDeployments({
  deployments,
  releases,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  deployments: HubDeployment[];
  releases: HubRelease[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (loading) return <HubLoadingState label="Loading deployments" />;
  if (error) return <HubErrorState error={error} onRetry={onRetry} />;
  if (deployments.length === 0) {
    return (
      <HubEmptyState
        title="No deployments"
        description="A deployment record will appear after a verified release is sent to the default environment."
      />
    );
  }
  const versions = new Map(
    releases.map((release) => [release.id, release.version]),
  );

  return (
    <div className="space-y-4">
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Deployment</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment) => (
                <TableRow key={deployment.id}>
                  <TableCell className="pl-4">
                    <Link
                      className="font-mono text-xs underline-offset-4 hover:underline"
                      to={`/deployments/${encodeURIComponent(deployment.id)}`}
                    >
                      {deployment.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {versions.get(deployment.targetReleaseId) ??
                      deployment.targetReleaseId}
                  </TableCell>
                  <TableCell>{deployment.environmentId}</TableCell>
                  <TableCell>
                    <HubStatusBadge status={deployment.status} />
                  </TableCell>
                  <TableCell>
                    {formatHubDate(
                      deployment.startedAt ?? deployment.createdAt,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <HubLoadMore
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}

export default ApplicationDetailPage;

import { Activity, ArrowLeft, Boxes, GitCommit, Rocket } from "lucide-react";
import { useTranslate } from "@refinedev/core";
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
  const translate = useTranslate();
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

  const applicationKind = translate(
    "hub.application.notFoundKind",
    "Application",
  );
  if (!applicationId) return <HubNotFoundState kind={applicationKind} />;
  if (!runtime && me.loading) {
    return (
      <HubLoadingState
        label={translate("hub.access.loading", "Loading Hub access")}
      />
    );
  }
  if (!runtime && me.error) {
    return (
      <HubErrorState
        error={me.error}
        onRetry={me.reload}
        title={translate(
          "hub.access.loadError",
          "Unable to load your Hub access",
        )}
      />
    );
  }
  if (application.loading)
    return (
      <HubLoadingState
        label={translate("hub.application.loading", "Loading application")}
      />
    );
  if (application.error) {
    return (
      <HubErrorState
        error={application.error}
        onRetry={application.reload}
        title={translate(
          "hub.application.loadError",
          "Unable to load application",
        )}
      />
    );
  }
  if (!application.data) return <HubNotFoundState kind={applicationKind} />;
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
          {canReadGlobalApplications
            ? translate("hub.common.applications", "Applications")
            : translate("hub.common.home", "Home")}
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
        <TabsList
          variant="line"
          aria-label={translate(
            "hub.application.sectionsAria",
            "Application sections",
          )}
        >
          <TabsTrigger value="overview">
            {translate("hub.application.tabs.overview", "Overview")}
          </TabsTrigger>
          {canReadReleases ? (
            <TabsTrigger value="releases">
              {translate("hub.application.tabs.releases", "Releases")}
            </TabsTrigger>
          ) : null}
          {canReadDeployments ? (
            <TabsTrigger value="deployments">
              {translate("hub.application.tabs.deployments", "Deployments")}
            </TabsTrigger>
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
                ? translate(
                    "hub.application.deploy.changeTitle",
                    "Change active release",
                  )
                : translate("hub.application.deploy.title", "Deploy release")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">
                {translateWithValues(
                  translate,
                  "hub.application.deploy.currentRelease",
                  "Current release: {{version}}",
                  {
                    version:
                      releases.data?.find(
                        (release) =>
                          release.id === applicationData.activeReleaseId,
                      )?.version ??
                      applicationData.activeReleaseId ??
                      translate("hub.common.none", "None"),
                  },
                )}
              </span>
              <span className="block">
                {translateWithValues(
                  translate,
                  "hub.application.deploy.targetRelease",
                  "Target release: {{version}}",
                  { version: selectedRelease?.version ?? "—" },
                )}
              </span>
              <span className="block">
                {translateWithValues(
                  translate,
                  "hub.application.deploy.environment",
                  "Environment: {{environment}}",
                  { environment: applicationData.defaultEnvironmentId },
                )}
              </span>
              <span className="mt-2 block">
                {translate(
                  "hub.application.deploy.description",
                  "This creates a new Deployment. If it fails, the current release remains active.",
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deploymentError ? (
            <Alert variant="destructive">
              <AlertTitle>
                {translate(
                  "hub.application.deploy.error",
                  "Unable to create deployment",
                )}
              </AlertTitle>
              <AlertDescription>{deploymentError.message}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingDeployment}>
              {translate("hub.common.cancel", "Cancel")}
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
              {submittingDeployment
                ? translate("hub.application.deploy.starting", "Starting…")
                : translate(
                    "hub.application.deploy.confirm",
                    "Confirm deployment",
                  )}
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
  const translate = useTranslate();
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
        label={translate(
          "hub.application.overview.currentRelease",
          "Current release",
        )}
        value={
          activeRelease?.version ??
          application.activeReleaseId ??
          translate("hub.application.overview.notDeployed", "Not deployed")
        }
        detail={
          activeRelease
            ? translateWithValues(
                translate,
                "hub.application.overview.verifiedAt",
                "Verified {{date}}",
                { date: formatHubDate(activeRelease.createdAt) },
              )
            : translate(
                "hub.application.overview.noActiveMetadata",
                "No active release metadata",
              )
        }
      />
      <OverviewCard
        icon={<Boxes aria-hidden="true" />}
        label={translate("hub.application.overview.environment", "Environment")}
        value={application.defaultEnvironmentId}
        detail={translate(
          "hub.application.overview.mvpTarget",
          "MVP deployment target",
        )}
      />
      <OverviewCard
        icon={<Activity aria-hidden="true" />}
        label={translate(
          "hub.application.overview.latestDeployment",
          "Latest deployment",
        )}
        value={
          canReadDeployments
            ? latestDeployment
              ? latestDeployment.status
              : translate(
                  "hub.application.overview.noDeployments",
                  "No deployments",
                )
            : translate("hub.common.restricted", "Restricted")
        }
        detail={
          !canReadDeployments
            ? translate(
                "hub.application.overview.deploymentRestricted",
                "Deployment access not granted",
              )
            : latestDeployment
              ? formatHubDate(latestDeployment.createdAt)
              : translate(
                  "hub.application.overview.publishToBegin",
                  "Publish a verified release to begin",
                )
        }
        status={canReadDeployments ? latestDeployment?.status : undefined}
      />
      <OverviewCard
        icon={<GitCommit aria-hidden="true" />}
        label={translate(
          "hub.application.overview.availableReleases",
          "Available releases",
        )}
        value={
          canReadReleases
            ? String(releaseTotal ?? releases.length)
            : translate("hub.common.restricted", "Restricted")
        }
        detail={
          canReadReleases
            ? translateWithValues(
                translate,
                "hub.application.overview.updatedAt",
                "Updated {{date}}",
                { date: formatHubDate(application.updatedAt) },
              )
            : translate(
                "hub.application.overview.releaseRestricted",
                "Release access not granted",
              )
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
  const translate = useTranslate();
  if (loading) {
    return (
      <HubLoadingState
        label={translate("hub.releases.loading", "Loading releases")}
      />
    );
  }
  if (error) return <HubErrorState error={error} onRetry={onRetry} />;
  if (releases.length === 0) {
    return (
      <HubEmptyState
        title={translate("hub.releases.empty.title", "No releases")}
        description={translate(
          "hub.releases.empty.description",
          "Upload a SemVer release through the CLI to make it available for deployment.",
        )}
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
                <TableHead className="pl-4">
                  {translate("hub.releases.columns.version", "Version")}
                </TableHead>
                <TableHead>
                  {translate(
                    "hub.releases.columns.verification",
                    "Verification",
                  )}
                </TableHead>
                <TableHead>
                  {translate("hub.releases.columns.source", "Source")}
                </TableHead>
                <TableHead>
                  {translate("hub.releases.columns.size", "Size")}
                </TableHead>
                <TableHead>
                  {translate("hub.releases.columns.created", "Created")}
                </TableHead>
                <TableHead className="text-right">
                  {translate("hub.releases.columns.action", "Action")}
                </TableHead>
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
                          <Badge variant="outline">
                            {translate("hub.releases.current", "Current")}
                          </Badge>
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
                          aria-label={translateWithValues(
                            translate,
                            "hub.releases.deployAria",
                            "Deploy {{version}}",
                            { version: release.version },
                          )}
                          onClick={() => onDeployRelease(release, application)}
                        >
                          {application.activeReleaseId
                            ? translate(
                                "hub.releases.deployOrRollback",
                                "Deploy / roll back",
                              )
                            : translate("hub.releases.deploy", "Deploy")}
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
  const translate = useTranslate();
  if (loading) {
    return (
      <HubLoadingState
        label={translate(
          "hub.applicationDeployments.loading",
          "Loading deployments",
        )}
      />
    );
  }
  if (error) return <HubErrorState error={error} onRetry={onRetry} />;
  if (deployments.length === 0) {
    return (
      <HubEmptyState
        title={translate(
          "hub.applicationDeployments.empty.title",
          "No deployments",
        )}
        description={translate(
          "hub.applicationDeployments.empty.description",
          "A deployment record will appear after a verified release is sent to the default environment.",
        )}
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
                <TableHead className="pl-4">
                  {translate(
                    "hub.deployments.columns.deployment",
                    "Deployment",
                  )}
                </TableHead>
                <TableHead>
                  {translate("hub.deployments.columns.target", "Target")}
                </TableHead>
                <TableHead>
                  {translate("hub.common.environment", "Environment")}
                </TableHead>
                <TableHead>
                  {translate("hub.common.status", "Status")}
                </TableHead>
                <TableHead>
                  {translate("hub.common.started", "Started")}
                </TableHead>
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

function translateWithValues(
  translate: ReturnType<typeof useTranslate>,
  key: string,
  fallback: string,
  values: Record<string, string>,
): string {
  const translated = translate(key, values, fallback);
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{{${name}}}`, value),
    translated,
  );
}

export default ApplicationDetailPage;

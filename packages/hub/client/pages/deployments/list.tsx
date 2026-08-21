import { Activity, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type HubApplication,
  type HubDeployment,
  type HubFetcher,
  hasHubCapability,
} from "@/features/hub/api";
import {
  formatHubDate,
  HubEmptyState,
  HubErrorState,
  HubLoadMore,
  HubListSkeleton,
  HubStatusBadge,
} from "@/features/hub/components";
import { useHubPaginatedQuery } from "@/features/hub/pagination";
import { useOptionalHubRuntime } from "@/features/hub/provider";

export interface DeploymentsPageProps {
  fetcher?: HubFetcher;
}

export function DeploymentsPage({ fetcher }: DeploymentsPageProps) {
  const runtime = useOptionalHubRuntime();
  const capabilities = runtime?.me.capabilities;
  const canReadGlobalDeployments = hasHubCapability(
    capabilities,
    "hub.deployment",
    "read",
  );
  const scopedApplicationId = (capabilities?.application ?? []).find((entry) =>
    hasHubCapability(
      capabilities,
      "hub.deployment",
      "read",
      entry.applicationId,
    ),
  )?.applicationId;
  const deploymentPath =
    runtime && !canReadGlobalDeployments
      ? scopedApplicationId
        ? `/apps/${encodeURIComponent(scopedApplicationId)}/deployments`
        : null
      : "/deployments";
  const deployments = useHubPaginatedQuery<HubDeployment>({
    path: deploymentPath,
    fetcher,
  });
  const canReadGlobalApplications = hasHubCapability(
    capabilities,
    "hub.app",
    "read",
  );
  const applications = useHubPaginatedQuery<HubApplication>({
    path: runtime && !canReadGlobalApplications ? null : "/apps",
    fetcher,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [applicationId, setApplicationId] = useState("all");
  const applicationNames = useMemo(
    () => new Map((applications.data ?? []).map((app) => [app.id, app.name])),
    [applications.data],
  );
  const {
    hasMore: hasMoreApplications,
    loadMore: loadMoreApplications,
    loading: applicationsLoading,
    loadingMore: applicationsLoadingMore,
  } = applications;

  useEffect(() => {
    if (
      hasMoreApplications &&
      !applicationsLoading &&
      !applicationsLoadingMore
    ) {
      loadMoreApplications();
    }
  }, [
    applicationsLoading,
    applicationsLoadingMore,
    hasMoreApplications,
    loadMoreApplications,
  ]);
  const visibleDeployments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (deployments.data ?? []).filter((deployment) => {
      const matchesStatus = status === "all" || deployment.status === status;
      const matchesApplication =
        applicationId === "all" || deployment.applicationId === applicationId;
      const applicationName =
        applicationNames.get(deployment.applicationId) ?? "";
      const matchesSearch =
        !query ||
        deployment.id.toLowerCase().includes(query) ||
        deployment.targetReleaseId.toLowerCase().includes(query) ||
        applicationName.toLowerCase().includes(query);
      return matchesStatus && matchesApplication && matchesSearch;
    });
  }, [applicationId, applicationNames, deployments.data, search, status]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="size-4" aria-hidden="true" />
          <span className="text-sm font-medium">Operations</span>
        </div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Deployments
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Follow deployments and rollbacks across every application and inspect
          the complete execution timeline.
        </p>
      </header>

      {deployments.error ? (
        <HubErrorState error={deployments.error} onRetry={deployments.reload} />
      ) : deployments.loading ? (
        <HubListSkeleton rows={6} />
      ) : (deployments.data?.length ?? 0) === 0 ? (
        <HubEmptyState
          title="No deployments yet"
          description="Deploy a verified application release to create the first operation record."
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1 lg:max-w-sm">
              <span className="sr-only">Search deployments</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search deployment or release"
                className="pl-8"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <NativeSelect
                value={applicationId}
                onChange={(event) => setApplicationId(event.target.value)}
                aria-label="Filter by application"
              >
                <NativeSelectOption value="all">
                  All applications
                </NativeSelectOption>
                {(applications.data ?? []).map((application) => (
                  <NativeSelectOption
                    key={application.id}
                    value={application.id}
                  >
                    {application.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label="Filter by deployment status"
              >
                <NativeSelectOption value="all">
                  All statuses
                </NativeSelectOption>
                <NativeSelectOption value="queued">Queued</NativeSelectOption>
                <NativeSelectOption value="preparing">
                  Preparing
                </NativeSelectOption>
                <NativeSelectOption value="checking">
                  Checking
                </NativeSelectOption>
                <NativeSelectOption value="switching">
                  Switching
                </NativeSelectOption>
                <NativeSelectOption value="draining">
                  Draining
                </NativeSelectOption>
                <NativeSelectOption value="succeeded">
                  Succeeded
                </NativeSelectOption>
                <NativeSelectOption value="failed">Failed</NativeSelectOption>
                <NativeSelectOption value="cancelled">
                  Cancelled
                </NativeSelectOption>
              </NativeSelect>
            </div>
          </div>

          {visibleDeployments.length === 0 ? (
            <HubEmptyState
              title="No matching deployments"
              description="Change the filters to see other deployment records."
            />
          ) : (
            <DeploymentResults
              deployments={visibleDeployments}
              applicationNames={applicationNames}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Showing {visibleDeployments.length} of{" "}
            {deployments.meta?.total ?? deployments.data?.length ?? 0}{" "}
            deployments
          </p>
          <HubLoadMore
            hasMore={deployments.hasMore}
            loading={deployments.loadingMore}
            onLoadMore={deployments.loadMore}
          />
        </>
      )}
    </div>
  );
}

function DeploymentResults({
  deployments,
  applicationNames,
}: {
  deployments: HubDeployment[];
  applicationNames: Map<string, string>;
}) {
  return (
    <>
      <Card className="hidden py-0 md:block">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Application</TableHead>
                <TableHead>Target release</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Requested by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment) => (
                <TableRow key={deployment.id}>
                  <TableCell className="pl-4">
                    <Link
                      className="font-medium underline-offset-4 hover:underline"
                      to={`/deployments/${encodeURIComponent(deployment.id)}`}
                    >
                      {applicationNames.get(deployment.applicationId) ??
                        deployment.applicationId}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">
                      {deployment.id}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {deployment.targetReleaseId}
                  </TableCell>
                  <TableCell>{deployment.environmentId}</TableCell>
                  <TableCell className="capitalize">
                    {deployment.type}
                  </TableCell>
                  <TableCell>
                    <HubStatusBadge status={deployment.status} />
                  </TableCell>
                  <TableCell>
                    {formatHubDate(
                      deployment.startedAt ?? deployment.createdAt,
                    )}
                  </TableCell>
                  <TableCell>{deployment.requestedBy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:hidden">
        {deployments.map((deployment) => (
          <Card key={deployment.id} size="sm">
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    className="font-medium underline-offset-4 hover:underline"
                    to={`/deployments/${encodeURIComponent(deployment.id)}`}
                  >
                    {applicationNames.get(deployment.applicationId) ??
                      deployment.applicationId}
                  </Link>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {deployment.id}
                  </p>
                </div>
                <HubStatusBadge status={deployment.status} />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Environment</dt>
                  <dd className="mt-1 font-medium">
                    {deployment.environmentId}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Started</dt>
                  <dd className="mt-1 font-medium">
                    {formatHubDate(
                      deployment.startedAt ?? deployment.createdAt,
                    )}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

export default DeploymentsPage;

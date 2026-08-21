import { Boxes, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslate } from "@refinedev/core";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  HubLoadMore,
  HubListSkeleton,
  HubStatusBadge,
} from "@/features/hub/components";
import { useHubPaginatedQuery } from "@/features/hub/pagination";
import { useOptionalHubRuntime } from "@/features/hub/provider";

export interface ApplicationsPageProps {
  fetcher?: HubFetcher;
  onCreateApplication?: () => void;
}

export function ApplicationsPage({
  fetcher,
  onCreateApplication,
}: ApplicationsPageProps) {
  const translate = useTranslate();
  const applications = useHubPaginatedQuery<HubApplication>({
    path: "/apps",
    fetcher,
  });
  const runtime = useOptionalHubRuntime();
  const me = useHubQuery<HubMe>({
    path: runtime ? null : "/me",
    fetcher,
    enabled: !runtime,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const canCreate = hasHubCapability(
    runtime?.me.capabilities ?? me.data?.capabilities,
    "hub.app",
    "create",
  );
  const visibleApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (applications.data ?? []).filter((application) => {
      const matchesStatus = status === "all" || application.status === status;
      const matchesSearch =
        !query ||
        application.name.toLowerCase().includes(query) ||
        application.slug.toLowerCase().includes(query) ||
        application.description?.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [applications.data, search, status]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Boxes className="size-4" aria-hidden="true" />
            <span className="text-sm font-medium">
              {translate("hub.apps.eyebrow", "Control plane")}
            </span>
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {translate("hub.apps.title", "Applications")}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {translate(
              "hub.apps.description",
              "Inspect deployed applications, active releases, environments, and runtime state from one place.",
            )}
          </p>
        </div>
        {canCreate ? (
          <Button
            type="button"
            onClick={() => {
              if (onCreateApplication) {
                onCreateApplication();
              } else {
                setCreateOpen(true);
              }
            }}
          >
            <Plus aria-hidden="true" />
            {translate("hub.apps.create", "Create application")}
          </Button>
        ) : null}
      </header>

      {applications.error ? (
        <HubErrorState
          error={applications.error}
          onRetry={applications.reload}
        />
      ) : applications.loading ? (
        <HubListSkeleton rows={5} />
      ) : (applications.data?.length ?? 0) === 0 ? (
        <HubEmptyState
          title={translate("hub.apps.empty.title", "No applications yet")}
          description={translate(
            "hub.apps.empty.description",
            "Publish the first application with the NocoBase CLI. Once its release is registered, it will appear here for deployment.",
          )}
          action={
            <code className="rounded-md bg-muted px-2.5 py-1.5 text-xs">
              nb app publish
            </code>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1 sm:max-w-sm">
              <span className="sr-only">
                {translate("hub.apps.search.label", "Search applications")}
              </span>
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={translate(
                  "hub.apps.search.placeholder",
                  "Search by name or slug",
                )}
                className="pl-8"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{translate("hub.common.status", "Status")}</span>
              <NativeSelect
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label={translate(
                  "hub.apps.filter.statusAria",
                  "Filter by status",
                )}
              >
                <NativeSelectOption value="all">
                  {translate("hub.apps.filter.allStatuses", "All statuses")}
                </NativeSelectOption>
                <NativeSelectOption value="active">
                  {translate("hub.status.active", "Active")}
                </NativeSelectOption>
                <NativeSelectOption value="disabled">
                  {translate("hub.status.disabled", "Disabled")}
                </NativeSelectOption>
                <NativeSelectOption value="archived">
                  {translate("hub.status.archived", "Archived")}
                </NativeSelectOption>
              </NativeSelect>
            </label>
          </div>

          {visibleApplications.length === 0 ? (
            <HubEmptyState
              title={translate(
                "hub.apps.noMatches.title",
                "No matching applications",
              )}
              description={translate(
                "hub.apps.noMatches.description",
                "Change the search text or status filter to see other applications.",
              )}
            />
          ) : (
            <ApplicationResults applications={visibleApplications} />
          )}

          <p className="text-xs text-muted-foreground">
            {translate(
              "hub.apps.summary",
              {
                visible: visibleApplications.length,
                total:
                  applications.meta?.total ?? applications.data?.length ?? 0,
              },
              "Showing {{visible}} of {{total}} applications",
            )}
          </p>
          <HubLoadMore
            hasMore={applications.hasMore}
            loading={applications.loadingMore}
            onLoadMore={applications.loadMore}
          />
        </>
      )}
      <CreateApplicationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        fetcher={fetcher}
        onCreated={applications.reload}
      />
    </div>
  );
}

function CreateApplicationDialog({
  open,
  onOpenChange,
  fetcher,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetcher?: HubFetcher;
  onCreated: () => void;
}) {
  const translate = useTranslate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = () => {
    setName("");
    setSlug("");
    setDescription("");
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !submitting) reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitting(true);
            setError(null);
            void hubPost<HubApplication>(
              "/apps",
              {
                name: name.trim(),
                slug: slug.trim(),
                description: description.trim() || undefined,
              },
              fetcher,
            )
              .then(() => {
                onOpenChange(false);
                reset();
                onCreated();
              })
              .catch((reason: unknown) => {
                setError(
                  reason instanceof Error ? reason : new Error(String(reason)),
                );
              })
              .finally(() => setSubmitting(false));
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {translate("hub.apps.createDialog.title", "Create application")}
            </DialogTitle>
            <DialogDescription>
              {translate(
                "hub.apps.createDialog.description",
                "Register the stable identity used by releases and deployments.",
              )}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>
                {translate(
                  "hub.apps.createDialog.error",
                  "Unable to create application",
                )}
              </AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="hub-application-name">
              {translate("hub.common.name", "Name")}
            </Label>
            <Input
              id="hub-application-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hub-application-slug">
              {translate("hub.common.slug", "Slug")}
            </Label>
            <Input
              id="hub-application-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              pattern={"[a-z0-9](?:[a-z0-9\\-]*[a-z0-9])?"}
              placeholder="orders"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hub-application-description">
              {translate("hub.common.description", "Description")}
            </Label>
            <Input
              id="hub-application-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              {translate("hub.common.cancel", "Cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? translate("hub.apps.createDialog.submitting", "Creating…")
                : translate("hub.apps.createDialog.submit", "Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApplicationResults({
  applications,
}: {
  applications: HubApplication[];
}) {
  const translate = useTranslate();
  return (
    <>
      <Card className="hidden py-0 md:block">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">
                  {translate("hub.common.application", "Application")}
                </TableHead>
                <TableHead>
                  {translate("hub.common.status", "Status")}
                </TableHead>
                <TableHead>
                  {translate(
                    "hub.apps.columns.currentRelease",
                    "Current release",
                  )}
                </TableHead>
                <TableHead>
                  {translate("hub.common.environment", "Environment")}
                </TableHead>
                <TableHead>
                  {translate("hub.common.updated", "Updated")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((application) => (
                <TableRow key={application.id}>
                  <TableCell className="pl-4">
                    <Link
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                      to={`/apps/${encodeURIComponent(application.id)}`}
                    >
                      {application.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {application.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    <HubStatusBadge status={application.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {application.activeReleaseId ??
                      translate("hub.apps.notDeployed", "Not deployed")}
                  </TableCell>
                  <TableCell>{application.defaultEnvironmentId}</TableCell>
                  <TableCell>{formatHubDate(application.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:hidden">
        {applications.map((application) => (
          <Card key={application.id} size="sm">
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    className="font-medium underline-offset-4 hover:underline"
                    to={`/apps/${encodeURIComponent(application.id)}`}
                  >
                    {application.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {application.slug}
                  </p>
                </div>
                <HubStatusBadge status={application.status} />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">
                    {translate("hub.common.environment", "Environment")}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {application.defaultEnvironmentId}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {translate("hub.common.updated", "Updated")}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {formatHubDate(application.updatedAt)}
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

export default ApplicationsPage;

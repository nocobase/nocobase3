import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Mail,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ShieldAlert,
} from "lucide-react";
import { NavLink } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  fetchDeliveries,
  fetchDelivery,
  fetchProviders,
  retryDelivery,
  testProvider,
  type DeliveryDetail,
  type DeliveryFilters,
  type DeliveryListItem,
  type DeliveryStatus,
  type ProviderConnectionResult,
  type ProviderSummary,
} from "./api";

const statusLabels: Record<DeliveryStatus, string> = {
  queued: "Queued",
  sending: "Sending",
  accepted: "Accepted",
  delivered: "Delivered",
  failed: "Failed",
  submission_unknown: "Needs attention",
};
const statusClasses: Record<DeliveryStatus, string> = {
  queued: "border-slate-200 bg-slate-50 text-slate-700",
  sending: "border-blue-200 bg-blue-50 text-blue-700",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  submission_unknown: "border-amber-300 bg-amber-50 text-amber-800",
};

export function NotificationDeliveryAdminPage(): React.ReactElement {
  const [filters, setFilters] = useState<DeliveryFilters>({
    page: 1,
    pageSize: 25,
  });
  const [draftSearch, setDraftSearch] = useState("");
  const [items, setItems] = useState<readonly DeliveryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [boundary, setBoundary] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<DeliveryDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [retryOpen, setRetryOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    fetchDeliveries(filters, controller.signal)
      .then((response) => {
        setItems(response.data);
        setTotal(response.total);
        setBoundary(response.accessBoundary);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [filters, revision]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined);
      return;
    }
    const controller = new AbortController();
    fetchDelivery(selectedId, controller.signal)
      .then(setDetail)
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, [selectedId, revision]);

  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  return (
    <NotificationAdminLayout
      active="deliveries"
      title="Delivery log"
      description="Find a delivery, inspect its redacted ledger, and explicitly retry terminal failures."
    >
      <TemporaryBoundary text={boundary} />
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b bg-muted/20 py-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <CardTitle>Deliveries</CardTitle>
              <CardDescription>
                {total.toLocaleString()} matching records · newest update first
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <NativeSelect
                className="w-full sm:w-40"
                aria-label="Filter by status"
                value={filters.status ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: (event.target.value as DeliveryStatus) || undefined,
                    page: 1,
                  }))
                }
              >
                <NativeSelectOption value="">All statuses</NativeSelectOption>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                className="w-full sm:w-36"
                aria-label="Filter by channel"
                value={filters.channel ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    channel:
                      event.target.value === "email" ||
                      event.target.value === "in-app"
                        ? event.target.value
                        : undefined,
                    page: 1,
                  }))
                }
              >
                <NativeSelectOption value="">All channels</NativeSelectOption>
                <NativeSelectOption value="in-app">In-app</NativeSelectOption>
                <NativeSelectOption value="email">Email</NativeSelectOption>
              </NativeSelect>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFilters((current) => ({
                    ...current,
                    search: draftSearch.trim() || undefined,
                    page: 1,
                  }));
                }}
              >
                <Input
                  aria-label="Search deliveries"
                  className="min-w-52"
                  maxLength={200}
                  placeholder="ID, notification, recipient…"
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                />
                <Button type="submit" variant="outline">
                  <Search /> Search
                </Button>
              </form>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <InlineError
              message={error}
              onRetry={() => setRevision((value) => value + 1)}
            />
          ) : loading ? (
            <LoadingRows />
          ) : items.length === 0 ? (
            <EmptyLedger />
          ) : (
            <>
              <div className="hidden md:block">
                <DeliveryTable items={items} onSelect={setSelectedId} />
              </div>
              <div className="divide-y md:hidden">
                {items.map((item) => (
                  <DeliveryCard
                    key={item.id}
                    item={item}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {filters.page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page <= 1}
            onClick={() =>
              setFilters((current) => ({ ...current, page: current.page - 1 }))
            }
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page >= pageCount}
            onClick={() =>
              setFilters((current) => ({ ...current, page: current.page + 1 }))
            }
          >
            Next
          </Button>
        </div>
      </div>
      <DeliveryDrawer
        detail={detail}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(undefined);
        }}
        onRetry={() => setRetryOpen(true)}
      />
      <RetryDialog
        detail={detail}
        open={retryOpen}
        onOpenChange={setRetryOpen}
        onComplete={() => {
          setRetryOpen(false);
          setRevision((value) => value + 1);
        }}
      />
    </NotificationAdminLayout>
  );
}

export function NotificationProviderAdminPage(): React.ReactElement {
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [testing, setTesting] = useState<ProviderSummary>();
  const [result, setResult] = useState<ProviderConnectionResult>();
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetchProviders(controller.signal)
      .then(setProviders)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const runTest = async (): Promise<void> => {
    if (!testing) return;
    setRunning(true);
    setResult(undefined);
    try {
      setResult(await testProvider(testing.id));
    } catch (reason) {
      setResult({
        providerId: testing.id,
        ok: false,
        checkedAt: new Date().toISOString(),
        error: {
          code: "REQUEST_FAILED",
          message:
            reason instanceof Error
              ? reason.message
              : "Connection test failed.",
        },
      });
    } finally {
      setRunning(false);
    }
  };
  return (
    <NotificationAdminLayout
      active="providers"
      title="Providers"
      description="Review the code-owned provider chain and validate connectivity without sending mail."
    >
      <TemporaryBoundary text="TEMPORARY: all authenticated Portal users; remove when Notification AuthorizationPolicy is connected." />
      {error ? (
        <InlineError message={error} />
      ) : loading ? (
        <LoadingRows />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((provider) => (
            <Card key={provider.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Server className="size-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{provider.id}</CardTitle>
                      <CardDescription>
                        #{provider.order} in Email chain ·{" "}
                        {provider.type.toUpperCase()}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      provider.active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : ""
                    }
                  >
                    {provider.active
                      ? "Active"
                      : provider.enabled
                      ? "Unavailable"
                      : "Disabled"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <DefinitionList
                  values={[
                    ["Revision", provider.configRevision],
                    ["Host", provider.connection?.host ?? "—"],
                    [
                      "Port / security",
                      provider.connection
                        ? `${provider.connection.port} · ${
                            provider.connection.secure
                              ? "TLS"
                              : "STARTTLS/plain policy"
                          }`
                        : "—",
                    ],
                    [
                      "Secrets",
                      provider.secrets.length
                        ? provider.secrets
                            .map(
                              (secret) =>
                                `${secret.reference}: ${
                                  secret.configured
                                    ? "configured"
                                    : "not active"
                                }`
                            )
                            .join(" · ")
                        : "Not required",
                    ],
                  ]}
                />
                <Button
                  variant="outline"
                  disabled={!provider.active}
                  onClick={() => {
                    setTesting(provider);
                    setResult(undefined);
                  }}
                >
                  <CircleDot /> Test connection
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog
        open={Boolean(testing)}
        onOpenChange={(open) => {
          if (!open) {
            setTesting(undefined);
            setResult(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test provider connection</DialogTitle>
            <DialogDescription>
              This validates connection, TLS, and authentication only. It does
              not send an email or create a Delivery.
            </DialogDescription>
          </DialogHeader>
          {result && (
            <Alert variant={result.ok ? "default" : "destructive"}>
              {result.ok ? <CheckCircle2 /> : <AlertTriangle />}
              <AlertTitle>
                {result.ok ? "Connection succeeded" : "Connection failed"}
              </AlertTitle>
              <AlertDescription>
                {result.error?.message ??
                  `Checked ${formatDate(result.checkedAt)}`}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTesting(undefined);
                setResult(undefined);
              }}
            >
              Close
            </Button>
            <Button disabled={running} onClick={runTest}>
              {running && <RefreshCw className="animate-spin" />}
              {running ? "Testing…" : "Run test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NotificationAdminLayout>
  );
}

function NotificationAdminLayout({
  active,
  title,
  description,
  children,
}: {
  readonly active: "deliveries" | "providers";
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Mail className="size-4" /> Notification operations
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <nav
          className="flex rounded-xl border bg-card p-1 shadow-sm"
          aria-label="Notification administration"
        >
          <NavLink
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium",
              active === "deliveries"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            to="/notifications"
          >
            Delivery log
          </NavLink>
          <NavLink
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium",
              active === "providers"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            to="/notifications/providers"
          >
            Providers
          </NavLink>
        </nav>
      </div>
      {children}
    </div>
  );
}

function TemporaryBoundary({
  text,
}: {
  readonly text: string;
}): React.ReactElement {
  return (
    <Alert className="border-amber-200 bg-amber-50/70">
      <ShieldAlert className="text-amber-700" />
      <AlertTitle className="text-amber-900">
        Temporary access boundary
      </AlertTitle>
      <AlertDescription className="text-amber-800">
        {text ||
          "All authenticated Portal users currently have access. This boundary must be removed when notification ACL is connected."}
      </AlertDescription>
    </Alert>
  );
}

function DeliveryTable({
  items,
  onSelect,
}: {
  readonly items: readonly DeliveryListItem[];
  readonly onSelect: (id: string) => void;
}): React.ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Delivery</TableHead>
          <TableHead>Recipient</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Channel / Provider</TableHead>
          <TableHead>Attempts</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <button
                className="font-mono text-xs font-medium text-primary hover:underline"
                onClick={() => onSelect(item.id)}
              >
                {compactId(item.id)}
              </button>
            </TableCell>
            <TableCell>{item.recipient}</TableCell>
            <TableCell>
              <StatusBadge status={item.status} />
            </TableCell>
            <TableCell>
              <div>{item.channel === "in-app" ? "In-app" : "Email"}</div>
              <div className="max-w-44 truncate text-xs text-muted-foreground">
                {item.provider ?? "—"}
              </div>
            </TableCell>
            <TableCell>{item.attemptCount}</TableCell>
            <TableCell>
              <div className="max-w-44 truncate">{item.source.type}</div>
              <div className="text-xs text-muted-foreground">
                {item.source.referenceId ?? "—"}
              </div>
            </TableCell>
            <TableCell>{formatDate(item.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DeliveryCard({
  item,
  onSelect,
}: {
  readonly item: DeliveryListItem;
  readonly onSelect: (id: string) => void;
}): React.ReactElement {
  return (
    <button
      className="w-full space-y-3 p-4 text-left hover:bg-muted/40"
      onClick={() => onSelect(item.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-xs font-medium text-primary">
          {compactId(item.id)}
        </span>
        <StatusBadge status={item.status} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="block text-xs text-muted-foreground">Recipient</span>
          {item.recipient}
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">Channel</span>
          {item.channel}
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">Source</span>
          {item.source.type}
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">Updated</span>
          {formatDate(item.updatedAt)}
        </div>
      </div>
    </button>
  );
}

function DeliveryDrawer({
  detail,
  open,
  onOpenChange,
  onRetry,
}: {
  readonly detail?: DeliveryDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRetry: () => void;
}): React.ReactElement {
  const retryable =
    detail?.status === "failed" || detail?.status === "submission_unknown";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>Delivery ledger</SheetTitle>
          <SheetDescription>
            {detail
              ? `${detail.id} · version ${detail.version}`
              : "Loading delivery…"}
          </SheetDescription>
        </SheetHeader>
        {detail && (
          <div className="space-y-6 px-4 pb-6">
            {detail.status === "submission_unknown" && (
              <Alert className="border-amber-300 bg-amber-50">
                <AlertTriangle className="text-amber-700" />
                <AlertTitle>Provider submission is uncertain</AlertTitle>
                <AlertDescription>
                  A retry may send a duplicate. Review the final Attempt before
                  proceeding.
                </AlertDescription>
              </Alert>
            )}
            <section>
              <h3 className="mb-3 text-sm font-semibold">Summary</h3>
              <DefinitionList
                values={[
                  ["Status", statusLabels[detail.status]],
                  [
                    "Recipient",
                    detail.recipient.email ??
                      detail.recipient.userId ??
                      "Redacted",
                  ],
                  [
                    "Source",
                    `${detail.source.type}${
                      detail.source.referenceId
                        ? ` · ${detail.source.referenceId}`
                        : ""
                    }`,
                  ],
                  ["Principal", detail.source.principalService],
                  ["Created", formatDate(detail.createdAt)],
                  ["Updated", formatDate(detail.updatedAt)],
                ]}
              />
            </section>
            <section>
              <h3 className="mb-3 text-sm font-semibold">
                Immutable content snapshot
              </h3>
              <DefinitionList
                values={[
                  ["Schema", String(detail.content.schemaVersion)],
                  ["Fields", detail.content.fields.join(", ")],
                  [
                    "Template",
                    detail.content.templateKey
                      ? `${detail.content.templateKey}@${detail.content.templateVersion}`
                      : "Direct content",
                  ],
                  ["Content hash", detail.content.templateContentHash ?? "—"],
                  ["Message ID", detail.content.messageId ?? "—"],
                  [
                    "Redacted sizes",
                    Object.entries(detail.content.byteLengths)
                      .map(([key, size]) => `${key}: ${size} B`)
                      .join(" · ") || "—",
                  ],
                ]}
              />
            </section>
            <section>
              <h3 className="mb-3 text-sm font-semibold">Provider chain</h3>
              <div className="flex flex-wrap gap-2">
                {detail.providerChain.map((provider, index) => (
                  <Badge
                    key={provider}
                    variant="outline"
                    className={
                      index === detail.providerCursor
                        ? "border-primary text-primary"
                        : ""
                    }
                  >
                    {index + 1}. {provider}
                  </Badge>
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-sm font-semibold">Attempts</h3>
              <div className="space-y-3">
                {detail.attempts.length ? (
                  detail.attempts.map((attempt) => (
                    <div key={attempt.id} className="rounded-xl border p-3">
                      <div className="flex justify-between gap-3">
                        <span className="font-medium">
                          #{attempt.sequence} · {attempt.providerInstance}
                        </span>
                        <Badge variant="outline">{attempt.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(attempt.startedAt)} · revision{" "}
                        {attempt.configRevision ?? "—"}
                      </p>
                      {attempt.error && (
                        <p className="mt-2 text-sm text-destructive">
                          {attempt.error.code}: {attempt.error.message}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No attempts recorded.
                  </p>
                )}
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-sm font-semibold">Status history</h3>
              <ol className="space-y-3 border-l pl-4">
                {detail.events.map((event) => (
                  <li key={event.sequence}>
                    <div className="font-medium">
                      {event.fromStatus ? `${event.fromStatus} → ` : ""}
                      {event.toStatus}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(event.occurredAt)}
                      {event.actor ? ` · ${event.actor}` : ""}
                      {event.reason ? ` · ${event.reason}` : ""}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
        <SheetFooter className="border-t">
          {retryable && (
            <Button onClick={onRetry}>
              <RotateCcw /> Retry delivery
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function RetryDialog({
  detail,
  open,
  onOpenChange,
  onComplete,
}: {
  readonly detail?: DeliveryDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onComplete: () => void;
}): React.ReactElement {
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open) {
      setReason("");
      setAcknowledged(false);
      setError(undefined);
    }
  }, [open]);
  const risky = detail?.status === "submission_unknown";
  const submit = async (): Promise<void> => {
    if (!detail) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await retryDelivery(detail.id, {
        expectedVersion: detail.version,
        reason,
        acknowledgeDuplicateRisk: acknowledged,
      });
      onComplete();
    } catch (reasonValue) {
      setError(
        reasonValue instanceof Error ? reasonValue.message : "Retry failed."
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {risky ? "Retry uncertain delivery" : "Retry failed delivery"}
          </DialogTitle>
          <DialogDescription>
            The original recipient, provider chain, and immutable content
            snapshot will be reused.
          </DialogDescription>
        </DialogHeader>
        {risky && (
          <Alert className="border-amber-300 bg-amber-50">
            <AlertTriangle className="text-amber-700" />
            <AlertTitle>Duplicate-send risk</AlertTitle>
            <AlertDescription>
              The Provider may already have accepted this message.
            </AlertDescription>
          </Alert>
        )}
        <label className="space-y-2 text-sm font-medium">
          Reason{" "}
          <Textarea
            maxLength={500}
            placeholder="Explain why this retry is required…"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {risky && (
          <label className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I understand that this action may send a duplicate message.
            </span>
          </label>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              reason.trim().length < 3 || (risky && !acknowledged) || submitting
            }
            onClick={submit}
          >
            {submitting ? "Retrying…" : "Confirm retry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DefinitionList({
  values,
}: {
  readonly values: readonly (readonly [string, string])[];
}): React.ReactElement {
  return (
    <dl className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
      {values.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </dt>
          <dd className="mt-1 break-words font-mono text-xs">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function StatusBadge({
  status,
}: {
  readonly status: DeliveryStatus;
}): React.ReactElement {
  return (
    <Badge variant="outline" className={statusClasses[status]}>
      {statusLabels[status]}
    </Badge>
  );
}
function InlineError({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}): React.ReactElement {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <div>
        <p className="font-medium">Unable to load notification operations</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw /> Retry
        </Button>
      )}
    </div>
  );
}
function LoadingRows(): React.ReactElement {
  return (
    <div className="space-y-3 p-5" aria-label="Loading">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
function EmptyLedger(): React.ReactElement {
  return (
    <div className="grid min-h-56 place-items-center p-6 text-center">
      <div>
        <CheckCircle2 className="mx-auto size-9 text-muted-foreground" />
        <p className="mt-3 font-medium">No matching deliveries</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Adjust the status, channel, or search filter.
        </p>
      </div>
    </div>
  );
}
function compactId(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

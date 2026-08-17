import { useEffect, useState } from "react";
import {
  ListFilter,
  MessagesSquare,
  PanelsLeftRight,
  PenLine,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import {
  MailInbox,
  MailUnreadIndicator,
  mailApi,
  useMailUnread,
  useMailCompose,
  type MailColumnId,
  type MailScope,
  type MailUserRecord,
} from "./components";
import {
  MailShowcasePage,
  MailShowcaseSection,
} from "./components/mail-showcase-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PERSONAL_COLUMNS: MailColumnId[] = [
  "from",
  "to",
  "subject",
  "boxType",
  "date",
  "isRead",
  "labels",
];
const ALL_COLUMNS: MailColumnId[] = [
  "from",
  "user",
  "email",
  "subject",
  "boxType",
  "date",
  "isRead",
];

const scenarios = [
  {
    title: "My mailbox",
    description:
      "A personal mailbox with folders, filters, and message actions.",
    path: "workspace",
    icon: PanelsLeftRight,
  },
  {
    title: "Mailbox views",
    description:
      "Switch between the current user's inbox and all connected mailboxes.",
    path: "personal",
    icon: Users,
  },
  {
    title: "Unread indicator",
    description:
      "Show a live unread count in navigation, buttons, or mailbox summaries.",
    path: "unread",
    icon: MessagesSquare,
  },
  {
    title: "Compose page",
    description: "A standalone compose route with query-string prefilling.",
    path: "compose",
    icon: PenLine,
  },
  {
    title: "Correspondence per user",
    description:
      "Select a user and inspect all messages exchanged with that address.",
    path: "filtered",
    icon: ListFilter,
  },
];

function useMailUsers() {
  const [users, setUsers] = useState<MailUserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    mailApi
      .getUsers()
      .then((next) => active && setUsers(next))
      .catch(() => active && setUsers([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { users, loading };
}

function userName(user: MailUserRecord) {
  return user.nickname || user.username || user.email || `User #${user.id}`;
}

function userInitials(user: MailUserRecord) {
  return userName(user)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function MailScenarioOverview() {
  return (
    <MailShowcasePage
      title="Mail integration scenarios"
      description="Compose and record-driven sending share one page, while the other examples cover personal mail, audience, and correspondence patterns."
      badge="Overview"
    >
      <MailShowcaseSection
        eyebrow="Component patterns"
        title="Choose a mail workflow to explore"
        description="Each example uses the same public mail components with a different page-level composition."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {scenarios.map((scenario, index) => {
            const Icon = scenario.icon;
            return (
              <Link
                key={scenario.path}
                to={scenario.path}
                className="group flex gap-4 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-primary/35 hover:bg-muted/30"
              >
                <span className="font-mono text-2xl font-semibold text-muted-foreground/40">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Icon className="mt-1 size-5 text-muted-foreground group-hover:text-primary" />
                <span>
                  <span className="block font-semibold">{scenario.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    {scenario.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </MailShowcaseSection>
    </MailShowcasePage>
  );
}

export function MailAudienceScenario() {
  const [scope, setScope] = useState<MailScope>("personal");
  return (
    <MailShowcasePage
      title="Mailbox views"
      description="Switch between the signed-in user's inbox and all connected mailboxes."
      badge="Mailbox scope"
    >
      <MailShowcaseSection
        eyebrow="Interactive preview"
        title="Personal and administrative mailbox views"
        description="The audience switch stays in the inbox action row while the table columns adapt to the selected scope."
      >
        <MailInbox
          scope={scope}
          columns={scope === "all" ? ALL_COLUMNS : PERSONAL_COLUMNS}
          toolbarActions={
            <Tabs
              value={scope}
              onValueChange={(value) => setScope(value as MailScope)}
            >
              <TabsList>
                <TabsTrigger value="personal">My inbox</TabsTrigger>
                <TabsTrigger value="all">All users</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />
      </MailShowcaseSection>
    </MailShowcasePage>
  );
}

export function MailUnreadScenario() {
  const { count, refresh } = useMailUnread();

  return (
    <MailShowcasePage
      title="Unread indicator"
      description="A reusable unread-count indicator that refreshes automatically with the mailbox."
      badge="Live status"
    >
      <MailShowcaseSection
        eyebrow="Interactive preview"
        title="Unread mail at a glance"
        description="The count refreshes every 60 seconds and whenever the browser window becomes active."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex min-h-40 flex-col justify-between rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div>
              <p className="text-sm font-semibold">Icon indicator</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the compact form in navigation and action areas.
              </p>
            </div>
            <div className="flex items-end justify-between">
              <div className="rounded-lg border bg-background p-3">
                <MailUnreadIndicator showZero />
              </div>
              <span className="text-3xl font-semibold tabular-nums">{count}</span>
            </div>
          </div>

          <div className="flex min-h-40 flex-col justify-between rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div>
              <p className="text-sm font-semibold">Labeled indicator</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a label when the component needs more context.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <MailUnreadIndicator label="Unread mail" showZero />
              <Button variant="outline" size="sm" onClick={refresh}>
                <RefreshCw />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </MailShowcaseSection>
    </MailShowcasePage>
  );
}

export function MailCorrespondenceScenario() {
  const { users, loading } = useMailUsers();
  const [selectedUser, setSelectedUser] = useState<MailUserRecord>();
  return (
    <MailShowcasePage
      title="Correspondence per user"
      description="Open a user from the directory to inspect the messages owned by that user's connected mailbox."
      badge="Record action"
    >
      <MailShowcaseSection
        eyebrow="User directory"
        title="Open mailbox correspondence from a business record"
        description="The user table owns the action entry; the reusable inbox opens in a side sheet scoped to that user."
      >
        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
            <Users className="size-4 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-semibold">Users</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loading ? "Loading…" : `${users.length} people`}
              </p>
            </div>
          </div>
          <Table>
            <TableHeader className="bg-muted/45">
              <TableRow>
                <TableHead className="w-[45%]">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Skeleton className="h-9 w-44" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-48" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="ml-auto h-8 w-32" />
                      </TableCell>
                    </TableRow>
                  ))
                : users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                              {userInitials(user)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {userName(user)}
                            </div>
                            {user.username && (
                              <div className="truncate text-xs text-muted-foreground">
                                @{user.username}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.email || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!user.email}
                          onClick={() => setSelectedUser(user)}
                        >
                          <MessagesSquare /> Correspondence
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      </MailShowcaseSection>

      <Sheet
        open={Boolean(selectedUser)}
        onOpenChange={(open) => !open && setSelectedUser(undefined)}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-4xl"
        >
          {selectedUser?.email && (
            <>
              <SheetHeader className="flex-row items-center gap-3 border-b border-border/60 px-6 py-4">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {userInitials(selectedUser)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate">
                    {userName(selectedUser)}
                  </SheetTitle>
                  <SheetDescription className="truncate">
                    {selectedUser.email}
                  </SheetDescription>
                </div>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-4">
                <MailInbox
                  key={selectedUser.id}
                  scope="all"
                  userId={selectedUser.id}
                  columns={PERSONAL_COLUMNS}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </MailShowcasePage>
  );
}

export function MailRecipientSelectionDemo() {
  const { users, loading } = useMailUsers();
  const { openCompose, composeDialog } = useMailCompose();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const eligibleUsers = users.filter((user) => Boolean(user.email));
  const selectedUsers = eligibleUsers.filter((user) =>
    selectedIds.has(user.id)
  );
  const allSelected =
    eligibleUsers.length > 0 && selectedUsers.length === eligibleUsers.length;

  const selectUser = (id: number, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {selectedUsers.length
              ? `${selectedUsers.length} selected`
              : "Select users to prefill recipients"}
          </span>
          <Button
            size="sm"
            disabled={!selectedUsers.length}
            onClick={() =>
              openCompose({
                to: selectedUsers.map((user) => user.email).join(", "),
                subject:
                  selectedUsers.length === 1
                    ? `Following up, ${userName(selectedUsers[0])}`
                    : undefined,
              })
            }
          >
            <Send /> Email selected
          </Button>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Loading users…
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedIds(
                        checked
                          ? new Set(eligibleUsers.map((user) => user.id))
                          : new Set()
                      )
                    }
                    aria-label="Select all users with email addresses"
                  />
                </TableHead>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-36 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(user.id)}
                      disabled={!user.email}
                      onCheckedChange={(checked) =>
                        selectUser(user.id, Boolean(checked))
                      }
                      aria-label={`Select ${userName(user)}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {userName(user)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email || "No email address"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!user.email}
                      onClick={() =>
                        openCompose({
                          to: user.email,
                          subject: `Following up, ${userName(user)}`,
                          body: `Hi ${userName(user)},<p></p>`,
                        })
                      }
                    >
                      <Send /> Send email
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {composeDialog}
    </>
  );
}

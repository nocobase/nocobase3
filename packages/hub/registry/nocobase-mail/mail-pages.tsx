import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Settings } from "lucide-react";
import {
  MailBoxType,
  MailComposeForm,
  MailFilters,
  MailInbox,
  MailMassTracking,
  MailSettingsDrawer,
  type ComposeInitialValues,
  type MailColumnId,
  type MailFilterValue,
} from "./components";
import {
  MailShowcasePage,
  MailShowcaseSection,
} from "./components/mail-showcase-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MailRecipientSelectionDemo } from "./mail-demo-pages";

const PERSONAL_COLUMNS: MailColumnId[] = [
  "from",
  "to",
  "subject",
  "boxType",
  "date",
  "isRead",
  "labels",
];
export function MailManagerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const filterValue = useMemo<MailFilterValue>(() => {
    const folder = searchParams.get("folder");
    const label = Number(searchParams.get("label"));
    const read = searchParams.get("read");
    return {
      boxType: Object.values(MailBoxType).includes(folder as MailBoxType)
        ? (folder as MailBoxType)
        : undefined,
      isRead: read === "read" ? true : read === "unread" ? false : undefined,
      labelId: Number.isFinite(label) && label > 0 ? label : undefined,
      isTodo:
        searchParams.get("todo") === "1" || searchParams.get("starred") === "1"
          ? true
          : undefined,
    };
  }, [searchParams]);

  const updateParams = (next: MailFilterValue) => {
    const params = new URLSearchParams();
    if (next.boxType) params.set("folder", next.boxType);
    if (next.isRead !== undefined) {
      params.set("read", next.isRead ? "read" : "unread");
    }
    if (next.labelId) params.set("label", String(next.labelId));
    if (next.isTodo) params.set("todo", "1");
    setSearchParams(params, { replace: true });
  };

  return (
    <MailShowcasePage
      title="My mailbox"
      description="Read, reply to, and manage messages from your connected mailboxes."
      badge="Personal mail"
    >
      <MailShowcaseSection
        eyebrow="Personal mailbox"
        title="Browse and work through your messages"
        description="Use tree filters to find messages, then read, reply, and manage them from the inbox."
      >
        <div className="grid min-h-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="self-start rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:sticky lg:top-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold">Filters</h3>
            </div>
            <MailFilters
              value={filterValue}
              onChange={updateParams}
              orientation="vertical"
            />
          </aside>
          <main className="min-w-0">
            <MailInbox
              scope="personal"
              boxType={filterValue.boxType}
              isRead={filterValue.isRead}
              labelId={filterValue.labelId}
              filter={filterValue.isTodo ? { isTodo: true } : undefined}
              columns={PERSONAL_COLUMNS}
              toolbarActions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings /> Settings
                </Button>
              }
            />
          </main>
        </div>
      </MailShowcaseSection>
      <MailSettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
    </MailShowcasePage>
  );
}

export function MailBulkPage() {
  const [jobsRevision, setJobsRevision] = useState(0);

  return (
    <MailShowcasePage
      title="Bulk mail"
      description="Send one separate message per recipient and track every delivery job."
      badge="Bulk delivery"
    >
      <MailShowcaseSection
        eyebrow="Bulk composer"
        title="Prepare one message for multiple recipients"
        description="Add at least two recipients. Each recipient receives an individual message."
      >
        <Card className="gap-0 py-0">
          <CardContent className="max-w-2xl p-6">
            <MailComposeForm
              bulkOnly
              allowScheduleSend={false}
              allowBulkSend
              onSent={() => setJobsRevision((revision) => revision + 1)}
            />
          </CardContent>
        </Card>
      </MailShowcaseSection>

      <MailShowcaseSection
        eyebrow="Delivery status"
        title="Track bulk jobs"
        description="Track delivery progress, cancel active jobs, and retry failed recipients."
      >
        <MailMassTracking key={jobsRevision} />
      </MailShowcaseSection>
    </MailShowcasePage>
  );
}

export function MailComposePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initial = useMemo<ComposeInitialValues>(
    () => ({
      to: searchParams.get("to") ?? undefined,
      cc: searchParams.get("cc") ?? undefined,
      subject: searchParams.get("subject") ?? undefined,
      body: searchParams.get("body") ?? undefined,
    }),
    [searchParams]
  );

  return (
    <MailShowcasePage
      title="Compose and send"
      description="Compose directly, send to selected user records, or reply from a live mail table."
      badge="Sending patterns"
    >
      <MailShowcaseSection
        eyebrow="Standalone composer"
        title="Compose a message"
        description="Send from a connected mailbox or prefill fields through URL parameters."
      >
        <Card className="gap-0 py-0">
          <CardContent className="max-w-2xl p-6">
            <MailComposeForm
              initial={initial}
              showCancel
              onSent={() => navigate("..")}
              onCancel={() => navigate("..")}
            />
          </CardContent>
        </Card>
      </MailShowcaseSection>

      <MailShowcaseSection
        eyebrow="Record-driven sending"
        title="Send to selected users"
        description="Select one or more user records and open compose with their addresses in To."
      >
        <MailRecipientSelectionDemo />
      </MailShowcaseSection>

      <MailShowcaseSection
        eyebrow="Reply workflow"
        title="Reply from a mail table"
        description="Open any message to try Reply, conditional Reply all, and Forward."
      >
        <MailInbox scope="personal" columns={PERSONAL_COLUMNS} />
      </MailShowcaseSection>
    </MailShowcasePage>
  );
}

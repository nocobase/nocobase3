import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RemoteSelect, type RemoteSelectLoadParams } from "../index";

type Teammate = {
  id: number;
  name: string;
  team: string;
};

const TEAMMATES: Teammate[] = [
  { id: 1, name: "Avery Chen", team: "Product" },
  { id: 2, name: "Mina Davis", team: "Product" },
  { id: 3, name: "Noah Kim", team: "Design" },
  { id: 4, name: "Sofia Garcia", team: "Design" },
  { id: 5, name: "Eli Wilson", team: "Engineering" },
  { id: 6, name: "Zoe Martin", team: "Engineering" },
  { id: 7, name: "Leo Wang", team: "Engineering" },
  { id: 8, name: "Ivy Thompson", team: "Sales" },
  { id: 9, name: "Owen Brown", team: "Sales" },
  { id: 10, name: "Nora Patel", team: "Support" },
  { id: 11, name: "Theo Smith", team: "Support" },
  { id: 12, name: "Maya Johnson", team: "Operations" },
];

function waitForNetwork(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("The request was aborted", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, 350);

    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

async function loadTeammates({
  page,
  pageSize,
  search,
  signal,
}: RemoteSelectLoadParams) {
  await waitForNetwork(signal);
  const normalizedSearch = search.toLowerCase();
  if (normalizedSearch === "error") {
    throw new Error("Demo request failed");
  }

  const matches = TEAMMATES.filter((teammate) =>
    `${teammate.name} ${teammate.team}`.toLowerCase().includes(normalizedSearch)
  );
  const start = (page - 1) * pageSize;

  return {
    items: matches.slice(start, start + pageSize),
    hasMore: start + pageSize < matches.length,
  };
}

const getTeammateKey = (teammate: Teammate) => teammate.id;
const getTeammateLabel = (teammate: Teammate) => teammate.name;
const renderTeammate = (teammate: Teammate) => (
  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
    <span className="truncate">{teammate.name}</span>
    <span className="shrink-0 text-xs text-muted-foreground">
      {teammate.team}
    </span>
  </div>
);

export default function RemoteSelectDemo() {
  const [owner, setOwner] = useState<Teammate | null>(null);
  const [reviewers, setReviewers] = useState<Teammate[]>([]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Badge variant="secondary">Client component</Badge>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Remote select
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Supply an asynchronous loader to search and page any API. The
          component keeps complete selected records, while transport and query
          filters remain application-owned.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Single selection</CardTitle>
            <CardDescription>
              Options are loaded only when the control opens. Search by name or
              team; enter “error” to preview retry handling.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <RemoteSelect<Teammate>
              value={owner}
              onValueChange={setOwner}
              requestKey={["demo-teammates"]}
              loadOptions={loadTeammates}
              getOptionKey={getTeammateKey}
              getOptionLabel={getTeammateLabel}
              renderOption={renderTeammate}
              pageSize={4}
              placeholder="Select an owner..."
              messages={{ searchPlaceholder: "Search teammates..." }}
            />
            <p className="text-sm text-muted-foreground">
              Selected: {owner ? `${owner.name} · ${owner.team}` : "None"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Multiple selection</CardTitle>
            <CardDescription>
              Select a result, then search again. Previously selected labels
              remain available even when they are not in the current page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <RemoteSelect<Teammate>
              multiple
              value={reviewers}
              onValueChange={setReviewers}
              requestKey={["demo-teammates"]}
              loadOptions={loadTeammates}
              getOptionKey={getTeammateKey}
              getOptionLabel={getTeammateLabel}
              renderOption={renderTeammate}
              pageSize={4}
              placeholder="Select reviewers..."
              messages={{ searchPlaceholder: "Search teammates..." }}
            />
            <p className="text-sm text-muted-foreground">
              Selected: {reviewers.length > 0
                ? reviewers.map((reviewer) => reviewer.name).join(", ")
                : "None"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

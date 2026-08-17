import { useMemo, useState, type ReactNode } from "react";
import {
  type ColumnDef,
  type VisibilityState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, MessagesSquare, Paperclip, SlidersHorizontal } from "lucide-react";
import type { MailColumnId, MailMessage } from "./types";
import { DEFAULT_MAIL_COLUMNS, MAIL_COLUMN_LABELS, MailBoxType } from "./types";
import { MailLabelBadge } from "./mail-label-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { MailEmpty } from "./mail-empty";
import { cn } from "@/lib/utils";

function formatDate(dateStr?: string) {
  if (!dateStr) return "";
  try {
    const date = parseISO(dateStr);
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMM d, yyyy");
  } catch {
    return "";
  }
}

function senderName(message: MailMessage) {
  return message.fromUser?.name || message.from || "Unknown";
}

function recipientSummary(message: MailMessage) {
  if (message.toUsers?.length) {
    return message.toUsers.map((u) => u.name || u.address).join(", ");
  }
  return message.to || "";
}

function threadCount(message: MailMessage) {
  const children =
    message.relatedMessageIds?.length ?? message.childrenMessages?.length ?? 0;
  return children > 0 ? children + 1 : 0;
}

const boxTypeLabels: Record<string, string> = {
  [MailBoxType.IN]: "Inbox",
  [MailBoxType.OUT]: "Sent",
  [MailBoxType.DRAFT]: "Draft",
  [MailBoxType.TRASH]: "Trash",
  [MailBoxType.SPAM]: "Spam",
  [MailBoxType.ARCHIVE]: "Archive",
  [MailBoxType.SCHEDULED]: "Scheduled",
};

const boxTypeStyles: Record<string, string> = {
  [MailBoxType.IN]: "border-blue-500/25 bg-blue-500/12 text-blue-600 dark:text-blue-400",
  [MailBoxType.OUT]: "border-green-500/25 bg-green-500/12 text-green-600 dark:text-green-400",
  [MailBoxType.DRAFT]: "border-cyan-500/25 bg-cyan-500/12 text-cyan-600 dark:text-cyan-400",
  [MailBoxType.SCHEDULED]: "border-amber-500/25 bg-amber-500/12 text-amber-600 dark:text-amber-400",
  [MailBoxType.SPAM]: "border-red-500/25 bg-red-500/12 text-red-600 dark:text-red-400",
  [MailBoxType.MASS]: "border-purple-500/25 bg-purple-500/12 text-purple-600 dark:text-purple-400",
  [MailBoxType.TRASH]: "border-border bg-muted text-muted-foreground",
  [MailBoxType.ARCHIVE]: "border-border bg-muted text-muted-foreground",
};

const columnHelper = createColumnHelper<MailMessage>();

// TanStack column defs are heterogeneous in TValue; `any` matches the library's
// own `ColumnDef<TData, any>` convention for mixed-value column collections.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MailColumnDef = ColumnDef<MailMessage, any>;

const DATA_COLUMN_DEFS: Record<MailColumnId, MailColumnDef> = {
  from: columnHelper.accessor((row) => senderName(row), {
    id: "from",
    header: MAIL_COLUMN_LABELS.from,
    cell: (info) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{senderName(info.row.original)}</div>
        <div className="truncate text-xs text-muted-foreground">
          {info.row.original.from}
        </div>
      </div>
    ),
  }),
  to: columnHelper.accessor((row) => recipientSummary(row), {
    id: "to",
    header: MAIL_COLUMN_LABELS.to,
    cell: (info) => (
      <span className="block max-w-[220px] truncate">
        {recipientSummary(info.row.original) || "-"}
      </span>
    ),
  }),
  subject: columnHelper.accessor((row) => row.subject, {
    id: "subject",
    header: MAIL_COLUMN_LABELS.subject,
    cell: (info) => {
      const message = info.row.original;
      const count = threadCount(message);
      return (
        <div className="flex items-center gap-1.5">
          <span className="block max-w-[280px] truncate">
            {message.isDraft ? "Draft: " : ""}
            {message.subject || "(no subject)"}
          </span>
          {count > 0 && (
            <span
              title={`${count} messages in this conversation`}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
            >
              <MessagesSquare className="size-2.5" />
              {count}
            </span>
          )}
        </div>
      );
    },
  }),
  date: columnHelper.accessor((row) => row.relatedMessageLatestDate ?? row.date, {
    id: "date",
    header: MAIL_COLUMN_LABELS.date,
    cell: (info) => (
      <span className="tabular-nums text-muted-foreground">
        {formatDate(info.row.original.relatedMessageLatestDate ?? info.row.original.date)}
      </span>
    ),
  }),
  boxType: columnHelper.accessor((row) => row.boxType, {
    id: "boxType",
    header: MAIL_COLUMN_LABELS.boxType,
    cell: (info) => {
      const boxType = info.row.original.boxType;
      return (
        <Badge
          variant="outline"
          className={cn(
            "capitalize",
            boxTypeStyles[boxType] ?? boxTypeStyles[MailBoxType.TRASH]
          )}
        >
          {boxTypeLabels[boxType] ?? boxType}
        </Badge>
      );
    },
  }),
  isRead: columnHelper.accessor((row) => row.isRead, {
    id: "isRead",
    header: MAIL_COLUMN_LABELS.isRead,
    cell: (info) => {
      const unread =
        !info.row.original.isRead ||
        info.row.original.relatedMessagesIsRead === false;
      return (
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "size-2 rounded-full",
              unread ? "bg-primary" : "bg-muted-foreground/30"
            )}
          />
          {unread ? "Unread" : "Read"}
        </span>
      );
    },
  }),
  email: columnHelper.accessor((row) => row.email, {
    id: "email",
    header: MAIL_COLUMN_LABELS.email,
    cell: (info) => (
      <span className="block max-w-[180px] truncate text-muted-foreground">
        {info.row.original.email}
      </span>
    ),
  }),
  user: columnHelper.accessor((row) => row.user?.nickname ?? row.user?.email ?? "", {
    id: "user",
    header: MAIL_COLUMN_LABELS.user,
    cell: (info) => (
      <span className="block max-w-[140px] truncate">
        {info.row.original.user?.nickname ||
          info.row.original.user?.email ||
          `#${info.row.original.userId ?? ""}`}
      </span>
    ),
  }),
  labels: columnHelper.display({
    id: "labels",
    header: MAIL_COLUMN_LABELS.labels,
    cell: (info) => (
      <div className="flex flex-wrap gap-1">
        {info.row.original.labels?.length ? (
          info.row.original.labels.map((label) => (
            <MailLabelBadge key={label.id} label={label} />
          ))
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </div>
    ),
  }),
  attachments: columnHelper.display({
    id: "attachments",
    header: MAIL_COLUMN_LABELS.attachments,
    cell: (info) =>
      info.row.original.attachments?.length ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Paperclip className="size-3.5" />
          {info.row.original.attachments.length}
        </span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  }),
};

export function MailTable({
  messages,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  selectedIds,
  activeId,
  onOpen,
  onSelect,
  columns = DEFAULT_MAIL_COLUMNS,
  emptyVariant = "inbox",
  toolbar,
  trailingAction,
  className,
}: {
  messages: MailMessage[];
  loading: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  selectedIds: Set<number>;
  activeId?: number;
  onOpen: (message: MailMessage) => void;
  onSelect: (id: number, checked: boolean) => void;
  columns?: MailColumnId[];
  emptyVariant?: "inbox" | "search";
  toolbar?: ReactNode;
  trailingAction?: ReactNode;
  className?: string;
}) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries(columns.map((id) => [id, true]))
  );

  const tableColumns = useMemo(() => {
    const allSelected =
      messages.length > 0 && messages.every((m) => selectedIds.has(m.id));

    const selectColumn: MailColumnDef = columnHelper.display({
      id: "select",
      header: () => (
        <Checkbox
          checked={allSelected}
          onCheckedChange={(checked) =>
            messages.forEach((m) => onSelect(m.id, Boolean(checked)))
          }
          aria-label="Select all"
        />
      ),
      cell: (info) => (
        <div
          className="flex w-fit items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selectedIds.has(info.row.original.id)}
            onCheckedChange={(checked) =>
              onSelect(info.row.original.id, Boolean(checked))
            }
            aria-label={`Select ${info.row.original.subject}`}
          />
        </div>
      ),
    });

    return [
      selectColumn,
      ...columns
        .map((id) => DATA_COLUMN_DEFS[id])
        .filter((def): def is MailColumnDef => Boolean(def)),
    ];
  }, [columns, messages, selectedIds, onSelect]);

  const table = useReactTable({
    data: messages,
    columns: tableColumns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  });

  const pageCount =
    total && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2">
        {toolbar && <div className="min-w-0 flex-1">{toolbar}</div>}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm">
                <SlidersHorizontal />
                Columns
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((id) => {
                const column = table.getColumn(id);
                if (!column) return null;
                return (
                  <DropdownMenuCheckboxItem
                    key={id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(Boolean(value))
                    }
                  >
                    {MAIL_COLUMN_LABELS[id]}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {trailingAction}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <Table>
          <TableHeader className="bg-muted/45">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: pageSize ?? 8 }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {table.getAllLeafColumns().map((column) => (
                    <TableCell key={`skeleton-${rowIndex}-${column.id}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const message = row.original;
                const unread =
                  !message.isRead || message.relatedMessagesIsRead === false;
                return (
                  <TableRow
                    key={row.id}
                    data-state={selectedIds.has(message.id) ? "selected" : undefined}
                    className={cn(
                      "cursor-pointer",
                      activeId === message.id && "bg-muted"
                    )}
                    onClick={() => onOpen(message)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cell.column.id === "select" ? "w-10" : undefined,
                          unread &&
                            cell.column.id !== "select" &&
                            cell.column.id !== "isRead" &&
                            cell.column.id !== "date"
                            ? "font-bold"
                            : undefined
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={table.getAllLeafColumns().length}
                  className="p-0"
                >
                  <MailEmpty variant={emptyVariant} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {onPageChange && total ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">
            {total} message{total === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!page || page <= 1}
              onClick={() => onPageChange((page ?? 1) - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              {page ?? 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!page || page >= pageCount}
              onClick={() => onPageChange((page ?? 1) + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

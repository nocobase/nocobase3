import { useEffect, useState } from "react";
import { useGetIdentity } from "@refinedev/core";
import {
  Archive,
  ChevronDown,
  Circle,
  CircleCheckBig,
  Clock3,
  FileText,
  FilterX,
  FolderTree,
  Inbox,
  Mail,
  MailOpen,
  ListTodo,
  Send,
  ShieldAlert,
  Tag,
  Tags,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { mailApi } from "./mail-api";
import { MailBoxType, type MailLabel } from "./types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface MailFilterValue {
  boxType?: MailBoxType;
  isRead?: boolean;
  labelId?: number;
  isTodo?: boolean;
}

export interface MailFiltersProps {
  value: MailFilterValue;
  onChange: (value: MailFilterValue) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

const FOLDERS: Array<{ value: MailBoxType; label: string; icon: LucideIcon }> = [
  { value: MailBoxType.IN, label: "Inbox", icon: Inbox },
  { value: MailBoxType.OUT, label: "Sent", icon: Send },
  { value: MailBoxType.DRAFT, label: "Drafts", icon: FileText },
  { value: MailBoxType.SCHEDULED, label: "Scheduled", icon: Clock3 },
  { value: MailBoxType.ARCHIVE, label: "Archive", icon: Archive },
  { value: MailBoxType.SPAM, label: "Spam", icon: ShieldAlert },
  { value: MailBoxType.TRASH, label: "Trash", icon: Trash2 },
];

function TreeGroup({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex h-8 items-center gap-2 px-2 text-xs font-semibold text-muted-foreground">
        <ChevronDown className="size-3.5" />
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <div className="ml-3 space-y-0.5 border-l pl-3">{children}</div>
    </div>
  );
}

function TreeItem({
  label,
  icon: Icon,
  selected,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
        selected
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function MailFilters({
  value,
  onChange,
  orientation = "horizontal",
  className,
}: MailFiltersProps) {
  const { data: identity } = useGetIdentity<{ id: number | string }>();
  const [labels, setLabels] = useState<MailLabel[]>([]);

  useEffect(() => {
    if (identity?.id === undefined || identity.id === null) {
      setLabels([]);
      return;
    }
    let active = true;
    mailApi
      .getLabels(identity.id)
      .then((next) => active && setLabels(next))
      .catch(() => active && setLabels([]));
    return () => {
      active = false;
    };
  }, [identity?.id]);

  const active = Boolean(value.boxType || value.isRead !== undefined || value.labelId || value.isTodo);

  if (orientation === "vertical") {
    return (
      <nav className={cn("space-y-3", className)} aria-label="Mail filters">
        <TreeGroup label="Folders" icon={FolderTree}>
          {FOLDERS.map((folder) => (
            <TreeItem
              key={folder.value}
              label={folder.label}
              icon={folder.icon}
              selected={value.boxType === folder.value}
              onClick={() =>
                onChange({
                  ...value,
                  boxType: value.boxType === folder.value ? undefined : folder.value,
                })
              }
            />
          ))}
        </TreeGroup>

        <TreeGroup label="Status" icon={MailOpen}>
          <TreeItem
            label="Unread"
            icon={Mail}
            selected={value.isRead === false}
            onClick={() =>
              onChange({ ...value, isRead: value.isRead === false ? undefined : false })
            }
          />
          <TreeItem
            label="Read"
            icon={MailOpen}
            selected={value.isRead === true}
            onClick={() =>
              onChange({ ...value, isRead: value.isRead === true ? undefined : true })
            }
          />
        </TreeGroup>

        <TreeGroup label="Labels" icon={Tags}>
          {labels.map((label) => (
            <TreeItem
              key={label.id}
              label={label.label}
              icon={Tag}
              selected={value.labelId === label.id}
              onClick={() =>
                onChange({
                  ...value,
                  labelId: value.labelId === label.id ? undefined : label.id,
                })
              }
            />
          ))}
        </TreeGroup>

        <TreeGroup label="Tasks" icon={ListTodo}>
          <TreeItem
            label="Todo"
            icon={value.isTodo ? CircleCheckBig : Circle}
            selected={Boolean(value.isTodo)}
            onClick={() =>
              onChange({ ...value, isTodo: value.isTodo ? undefined : true })
            }
          />
        </TreeGroup>

        {active && (
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => onChange({})}>
            <FilterX /> Clear filters
          </Button>
        )}
      </nav>
    );
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <Select
        value={value.boxType}
        onValueChange={(next) =>
          onChange({
            ...value,
            boxType: value.boxType === next ? undefined : next as MailBoxType,
          })
        }
      >
        <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Folder" /></SelectTrigger>
        <SelectContent>
          {FOLDERS.map((folder) => <SelectItem key={folder.value} value={folder.value}>{folder.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={value.isRead === undefined ? undefined : value.isRead ? "read" : "unread"}
        onValueChange={(next) => {
          const nextValue = next === "read";
          onChange({
            ...value,
            isRead: value.isRead === nextValue ? undefined : nextValue,
          });
        }}
      >
        <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="unread">Unread</SelectItem>
          <SelectItem value="read">Read</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={value.labelId ? String(value.labelId) : undefined}
        onValueChange={(next) => {
          const nextValue = Number(next);
          onChange({
            ...value,
            labelId: value.labelId === nextValue ? undefined : nextValue,
          });
        }}
      >
        <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Label" /></SelectTrigger>
        <SelectContent>
          {labels.map((label) => <SelectItem key={label.id} value={String(label.id)}>{label.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={value.isTodo ? "todo" : undefined}
        onValueChange={() =>
          onChange({ ...value, isTodo: value.isTodo ? undefined : true })
        }
      >
        <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Todo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todo">Todo</SelectItem>
        </SelectContent>
      </Select>

      {active && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})}>
          <FilterX /> Clear
        </Button>
      )}
    </div>
  );
}

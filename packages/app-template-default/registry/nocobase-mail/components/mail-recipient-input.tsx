import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, Loader2, UserRound, X } from "lucide-react";
import { mailApi } from "./mail-api";
import type { MailRecipientOption } from "./types";
import { cn } from "@/lib/utils";

export function currentToken(value: string) {
  return value.split(/[,;\n]/).at(-1)?.trim().toLocaleLowerCase() ?? "";
}

export function appendRecipient(value: string, email: string) {
  const endsWithSeparator = /[,;\n]\s*$/.test(value);
  const entries = value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!endsWithSeparator && entries.length) entries.pop();
  if (!entries.some((item) => item.toLocaleLowerCase() === email.toLocaleLowerCase())) {
    entries.push(email);
  }
  return entries.join(", ");
}

export function mergeRecipients(value: string, additions: string) {
  const entries = `${value},${additions}`
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return entries
    .filter(
      (item, index) =>
        entries.findIndex(
          (candidate) =>
            candidate.toLocaleLowerCase() === item.toLocaleLowerCase()
        ) === index
    )
    .join(", ");
}

export interface MailRecipientInputProps {
  value: string;
  onChange: (value: string) => void;
  options?: MailRecipientOption[];
  placeholder?: string;
  className?: string;
}

export function MailRecipientInput({
  value,
  onChange,
  options,
  placeholder,
  className,
}: MailRecipientInputProps) {
  const [users, setUsers] = useState<MailRecipientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectingOption = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    mailApi
      .getUsers()
      .then((records) => {
        if (!active) return;
        const nocobaseUsers = records.flatMap((record) =>
            record.email
              ? [{ email: record.email, name: record.nickname || record.username }]
              : []
          );
        const merged = [...nocobaseUsers, ...(options ?? [])];
        setUsers(
          merged.filter(
            (item, index) =>
              merged.findIndex(
                (candidate) =>
                  candidate.email.toLocaleLowerCase() === item.email.toLocaleLowerCase()
              ) === index
          )
        );
      })
      .catch(() => active && setUsers(options ?? []))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [options]);

  const recipients = useMemo(
    () =>
      value
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(
          (item, index, entries) =>
            item &&
            entries.findIndex(
              (candidate) =>
                candidate.toLocaleLowerCase() === item.toLocaleLowerCase()
            ) === index
        ),
    [value]
  );
  const selected = useMemo(
    () => new Set(recipients.map((item) => item.toLocaleLowerCase())),
    [recipients]
  );
  const matches = users
    .filter((item) => {
      const token = query.trim().toLocaleLowerCase();
      if (!token) return true;
      return `${item.name ?? ""} ${item.email} ${item.description ?? ""}`
        .toLocaleLowerCase()
        .includes(token);
    })
    .slice(0, 8);

  const commitRecipients = useCallback((rawValue: string) => {
    onChange(mergeRecipients(value, rawValue));
    setQuery("");
  }, [onChange, value]);

  const commitQuery = useCallback(() => {
    commitRecipients(query);
  }, [commitRecipients, query]);

  const removeRecipient = useCallback(
    (email: string) => {
      onChange(
        recipients
          .filter((item) => item.toLocaleLowerCase() !== email.toLocaleLowerCase())
          .join(", ")
      );
    },
    [onChange, recipients]
  );

  return (
    <Combobox.Root
      multiple
      open={open}
      onOpenChange={setOpen}
      inputValue={query}
      onInputValueChange={(nextValue, details) => {
        if (details.reason !== "input-change" && details.reason !== "none") return;
        if (/[,;\n]\s*$/.test(nextValue)) {
          commitRecipients(nextValue);
          return;
        }
        setQuery(nextValue);
        setOpen(true);
      }}
      value={recipients}
      onValueChange={(nextRecipients) => {
        onChange(nextRecipients.join(", "));
        setQuery("");
        selectingOption.current = false;
      }}
      filter={null}
      autoHighlight
    >
      <Combobox.InputGroup
        className={cn(
          "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2 py-1 text-sm transition-colors outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
          className
        )}
      >
        {recipients.map((email) => (
          <span
            key={email.toLocaleLowerCase()}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
          >
            <span className="max-w-48 truncate">{email}</span>
            <button
              type="button"
              title={`Remove ${email}`}
              aria-label={`Remove ${email}`}
              className="rounded-sm text-muted-foreground hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => removeRecipient(email)}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Combobox.Input
          aria-label={placeholder}
          placeholder={recipients.length ? undefined : placeholder}
          className="h-6 min-w-28 flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
          onFocus={() => setOpen(true)}
          onBlur={() => {
            if (!selectingOption.current) commitQuery();
          }}
          onKeyDown={(event) => {
            if ((event.key === "," || event.key === ";") && query.trim()) {
              event.preventDefault();
              commitQuery();
              return;
            }
            if (event.key === "Enter" && query.trim() && matches.length === 0) {
              event.preventDefault();
              commitQuery();
            }
          }}
        />
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner
          side="bottom"
          align="start"
          sideOffset={4}
          className="isolate z-50 w-[var(--anchor-width)] min-w-72"
        >
          <Combobox.Popup
            initialFocus={false}
            className="rounded-lg bg-popover p-1.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden"
          >
            <Combobox.List className="max-h-72 overflow-y-auto outline-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : matches.length ? (
                matches.map((item) => {
                  const isSelected = selected.has(item.email.toLocaleLowerCase());
                  return (
                    <Combobox.Item
                      key={item.email}
                      value={item.email}
                      onMouseDown={() => {
                        selectingOption.current = true;
                      }}
                      className="flex w-full cursor-default items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-hidden data-highlighted:bg-muted"
                    >
                      <UserRound className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.name || item.email}</span>
                        {item.name && (
                          <span className="block truncate text-xs text-muted-foreground">{item.email}</span>
                        )}
                      </span>
                      {isSelected && <Check className="size-4 text-primary" />}
                    </Combobox.Item>
                  );
                })
              ) : (
                <p className="px-2.5 py-3 text-xs text-muted-foreground">
                  Type a complete email address to add it directly.
                </p>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type ForwardedRef,
  type ReactElement,
} from "react";
import { ChevronsUpDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { RemoteSelectMessages, RemoteSelectProps } from "./types";
import { useRemoteOptions } from "./use-remote-options";

const DEFAULT_MESSAGES: RemoteSelectMessages = {
  searchPlaceholder: "Search...",
  empty: "No results found.",
  loading: "Loading...",
  loadMore: "Load more",
  loadingMore: "Loading more...",
  error: "Options could not be loaded.",
  retry: "Retry",
};

function RemoteSelectInner<TOption>(
  props: RemoteSelectProps<TOption>,
  forwardedRef: ForwardedRef<HTMLButtonElement>
) {
  const {
    className,
    containerClassName,
    debounceMs = 250,
    disabled,
    getOptionKey,
    getOptionLabel,
    loadOptions,
    messages: messageOverrides,
    onClick,
    onOpenChange,
    pageSize = 20,
    placeholder = "Select...",
    popupSide = "bottom",
    requestKey = [],
    renderOption,
    renderValue,
    multiple,
    value,
    onValueChange,
    ...triggerProps
  } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listboxId = useId();
  const messages = useMemo(
    () => ({ ...DEFAULT_MESSAGES, ...messageOverrides }),
    [messageOverrides]
  );
  const selectedOptions = multiple
    ? value
    : value
      ? [value]
      : [];
  const selectedKeys = new Set(
    selectedOptions.map((option) => getOptionKey(option))
  );
  const remote = useRemoteOptions({
    debounceMs,
    getOptionKey,
    loadOptions,
    open,
    pageSize,
    requestKey,
    search,
    selectId: listboxId,
  });

  const setTriggerRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );
  const changeOpen = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        setSearch("");
        remote.resetSearch();
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, remote.resetSearch]
  );

  const selectOption = (option: TOption) => {
    const key = getOptionKey(option);
    if (multiple) {
      onValueChange(
        selectedKeys.has(key)
          ? value.filter((item) => getOptionKey(item) !== key)
          : [...value, option]
      );
      return;
    }

    onValueChange(option);
    changeOpen(false);
  };

  const selectedContent = renderValue?.(selectedOptions) ??
    selectedOptions.map(getOptionLabel).join(", ");

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <div className={containerClassName}>
        <PopoverTrigger
          render={
            <Button
              {...triggerProps}
              ref={setTriggerRef}
              type="button"
              variant="outline"
              role="combobox"
              aria-controls={listboxId}
              aria-expanded={open}
              aria-busy={remote.loading || remote.loadingMore}
              disabled={disabled}
              className={cn(
                "h-10 w-full min-w-0 justify-between font-normal",
                className
              )}
              onClick={onClick}
            />
          }
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              !selectedOptions.length && "text-muted-foreground"
            )}
          >
            {selectedOptions.length ? selectedContent : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </PopoverTrigger>
      </div>

      <PopoverContent
        align="start"
        side={popupSide}
        sideOffset={8}
        positionerClassName="pointer-events-auto z-[70]"
        className="w-(--anchor-width) gap-0 overflow-hidden p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={messages.searchPlaceholder}
          />
          {remote.loading ? (
            <div className="flex min-h-24 items-center justify-center gap-2 px-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {messages.loading}
            </div>
          ) : remote.error && remote.options.length === 0 ? (
            <div className="flex min-h-24 flex-col items-center justify-center gap-2 px-3 py-4 text-center text-sm text-muted-foreground">
              <span>{messages.error}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={remote.retry}
              >
                {messages.retry}
              </Button>
            </div>
          ) : (
            <>
              <CommandEmpty>{messages.empty}</CommandEmpty>
              <CommandList id={listboxId}>
                <CommandGroup>
                  {remote.options.map((option) => {
                    const key = getOptionKey(option);
                    return (
                      <CommandItem
                        key={key}
                        value={`${getOptionLabel(option)} ${key}`}
                        data-checked={selectedKeys.has(key)}
                        onSelect={() => selectOption(option)}
                      >
                        {renderOption?.(option) ?? getOptionLabel(option)}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
              {remote.hasMore || remote.error ? (
                <div className="border-t p-1">
                  {remote.error ? (
                    <p className="px-2 py-1 text-xs text-destructive">
                      {messages.error}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    disabled={remote.loadingMore}
                    onClick={remote.error ? remote.retry : remote.loadMore}
                  >
                    {remote.loadingMore ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    {remote.error
                      ? messages.retry
                      : remote.loadingMore
                        ? messages.loadingMore
                        : messages.loadMore}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export const RemoteSelect = forwardRef(RemoteSelectInner) as <TOption>(
  props: RemoteSelectProps<TOption> & {
    ref?: ForwardedRef<HTMLButtonElement>;
  }
) => ReactElement;

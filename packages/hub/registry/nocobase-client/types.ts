import type { ReactNode } from "react";

export type RemoteSelectLoadParams = {
  search: string;
  page: number;
  pageSize: number;
  signal: AbortSignal;
};

export type RemoteSelectLoadResult<TOption> = {
  items: TOption[];
  hasMore: boolean;
};

export type RemoteSelectMessages = {
  searchPlaceholder: string;
  empty: string;
  loading: string;
  loadMore: string;
  loadingMore: string;
  error: string;
  retry: string;
};

export type RemoteSelectCommonProps<TOption> = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onChange" | "value"
> & {
  /**
   * Values that identify the remote data source and caller-owned filters.
   * Change this key whenever those inputs change so the option query reloads.
   */
  requestKey?: readonly unknown[];
  loadOptions: (
    params: RemoteSelectLoadParams
  ) => Promise<RemoteSelectLoadResult<TOption>>;
  getOptionKey: (option: TOption) => string | number;
  getOptionLabel: (option: TOption) => string;
  renderOption?: (option: TOption) => ReactNode;
  renderValue?: (selected: TOption[]) => ReactNode;
  pageSize?: number;
  debounceMs?: number;
  placeholder?: string;
  messages?: Partial<RemoteSelectMessages>;
  popupSide?: "top" | "bottom";
  containerClassName?: string;
  onOpenChange?: (open: boolean) => void;
};

export type RemoteSelectSingleProps<TOption> =
  RemoteSelectCommonProps<TOption> & {
    multiple?: false;
    value: TOption | null;
    onValueChange: (value: TOption | null) => void;
  };

export type RemoteSelectMultipleProps<TOption> =
  RemoteSelectCommonProps<TOption> & {
    multiple: true;
    value: TOption[];
    onValueChange: (value: TOption[]) => void;
  };

export type RemoteSelectProps<TOption> =
  | RemoteSelectSingleProps<TOption>
  | RemoteSelectMultipleProps<TOption>;

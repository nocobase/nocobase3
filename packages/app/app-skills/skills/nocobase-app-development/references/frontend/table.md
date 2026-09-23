# List pages

A list page is for browsing, finding and managing one kind of record. Its structure, top to bottom (guideline T1): `PageHeader` (primary button "New X") → toolbar (search, filters, clear filters) → table → pagination. Create, detail and edit are child-route overlays, rendered in the `<Outlet />` at the end of the list page (see `overlay.md`).

This document uses `client/pages/projects/index.tsx` as its example; the complete code is in section 10. For the route declaration see `page.md`; for the file layout of child routes see `child-routes.md`.

## 1. Choosing a table component

| Scenario                                                                                                 | What to use                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All data loaded at once (a few hundred to one or two thousand rows), sorted and paginated in the browser | `DataTable` (`@/components/data-table`), built on TanStack Table                                                                                                             |
| Larger data sets that need server-side pagination                                                        | `DataTable` does not support this. Compose it yourself from `@/components/ui/table` and `useReactTable({ manualPagination: true })`; this handbook has no example for it yet |

- Do not write a list from scratch with `Table`. The same directory also has `DataTableColumnHeader` (a sortable column header), `DataTablePagination` (the pagination bar) and `DataTableViewOptions` (the "Toggle columns" menu).
- Leave search and filtering to the backend: pass the filters as endpoint parameters; `DataTable` only displays, sorts and paginates.
- The reference page `client/pages/reference/examples/orders/orders.tsx` shows column definitions, `toolbar`, a row actions menu and `DataTableViewOptions` working together. It uses mock data, filters in the browser, and opens detail and create in a `Sheet` and a `Dialog` driven by component state; do not copy those parts. Use it only for structure and styling: do not import from `client/pages/reference/`, and do not give it a route.

## 2. DataTable props

| Prop                          | Description                                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `columns`                     | `ColumnDef<T>[]`, created with `useMemo`                                                                                                                                                            |
| `data`                        | Row data, `T[]`                                                                                                                                                                                     |
| `getRowId`                    | Returns a stable row id, for example `(row) => String(row.id)`                                                                                                                                      |
| `emptyMessage`                | What the table shows when there are no rows (default: "No results."); use it for the no-results message and "Clear filters"                                                                         |
| `pageSize`, `pageSizeOptions` | Rows per page, default 10; the selectable rows-per-page values default to `[10, 20, 30, 40, 50]`                                                                                                    |
| `pagination`                  | When set to `false`, all rows are shown and there is no pagination bar                                                                                                                              |
| `toolbar`                     | `(table) => ReactNode`, rendered above the table inside `DataTable`, with access to the table instance. For browser-side filtering and `DataTableViewOptions`                                       |
| `onRowClick`                  | Makes the whole row clickable. Do not use it when the row contains links, buttons or menus, because the clicks conflict. It does not work from the keyboard, so the first column still needs a link |
| `className`                   | Class name of the outer container                                                                                                                                                                   |

The template's `DataTable` has no `showSelectedCount` prop; see the first row of the next section.

## 3. Known DataTable behavior

The following has been checked against the template's `client/components/data-table.tsx` and `data-table-pagination.tsx`. Know these points before you use it, and handle them as needed in the design and the implementation:

| Behavior                                             | Impact                                                                                               | What to do                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The pagination bar always shows "N row(s) selected"  | A table without row selection still shows "0 of N row(s) selected."                                  | `DataTablePagination` already has a `showSelectedCount` prop, but `DataTable` does not pass it through. Add an optional `showSelectedCount` prop (default `true`) to `DataTable` that passes it through, and have the list page pass `false`. First check whether the application has already added it |
| The header menu of a sortable column includes "Hide" | If the page has no "Toggle columns" entry, a hidden column cannot be brought back                    | Write `enableHiding: false` in the column definition, or put `DataTableViewOptions` in `toolbar`                                                                                                                                                                                                       |
| No initial sorting state                             | The default order can only be the order the endpoint returns, and the header shows no sort direction | Have the endpoint return the default order (guideline T1.8: most recently updated first) and state this in the design; if needed, add an optional `initialSorting` prop to `DataTable`                                                                                                                 |
| Returns to page 1 when the data changes              | Search, filtering, refreshing and deleting all return to page 1                                      | Usually what you want. To stay on the current page, change `DataTable` (for example, add an `autoResetPageIndex` prop passed through to `useReactTable`) and handle the current page exceeding the page count after a delete                                                                           |
| Browser-side sorting compares character codes        | Chinese is not sorted by pinyin                                                                      | Offer no sorting on Chinese columns, or write a `sortingFn` in the column definition that compares with `Intl.Collator(locale)` (the example's name column does this)                                                                                                                                  |
| The page-number text has a fixed width, `w-[100px]`  | The Chinese "第 1 页，共 100 页" ("Page 1 of 100") wraps onto two lines                              | Change this part of `DataTablePagination` to `min-w-[100px] whitespace-nowrap`. First check whether the application has already changed it                                                                                                                                                             |
| The built-in `toolbar` container does not wrap       | With several controls in it, it overflows on narrow screens                                          | Put the page's own search and filters outside `DataTable`, using `flex flex-wrap` (as the example does)                                                                                                                                                                                                |

## 4. Changing shared components

- You may change the composed components under `client/components/` (`DataTable` and others): only add optional props and keep the default behavior unchanged, so other pages are unaffected; list these changes in the final report.
- Do not modify the primitives under `client/components/ui/` for a single page.
- When all tables need to change together (for example, the page-number width), change the shared component instead of building a separate version in one page.

## 5. Writing search and filters to the URL

The search term and filter values live in URL query parameters (`?q=…&status=…`), so a refresh, going back or a shared link restores them (guideline T1.7). Request parameters follow the URL, not the input.

- The search box's `placeholder` says which fields can be searched (guideline T1.1), for example "Search by name or owner". Both the search box and the filter controls need an `aria-label`.
- Write the search logic directly in the list page component; do not extract it into an application-wide hook or utility file.

### Do not bind the search box directly to the URL

Do not write `value={searchParams.get('q')}` together with a `setSearchParams` call in `onChange`. React Router changes the URL inside a transition, and between two keystrokes React resets the input to the old URL value: a Chinese input method leaves a string of raw pinyin in the box, the cursor jumps to the end when you edit in the middle, and fast typing drops characters (violating guideline A7). `tsc`, ESLint and tests that fill in a value in one step (such as Playwright's `fill()`) cannot catch this; verify with real character-by-character typing and an input method.

### How to write it

The names below match the variables and functions in the code in section 10.

1. **Keep the input's text in component state** (`text`). `onChange` updates `text` and starts a 300ms timer (`scheduleSearch`, guideline I5).
2. **No timer during composition**: `onChange` checks `event.nativeEvent.isComposing`, because pinyin that is still being composed is not a search term; `onCompositionEnd` starts the timer once a candidate is picked and confirmed.
3. **Write to the URL only after typing stops**: when the timer fires, `updateParams` sets or deletes `q` and writes with `{ replace: true }`, so going back does not step through every search term one by one. The URL keeps the input exactly as typed (spaces included); the request and the "are there any filters" check use the value after `trim()`.
4. **Base URL writes on the latest parameters**: `paramsRef` holds the parameters this page last wrote or the router last updated, and `updateParams` modifies those. Do not use `setSearchParams((prev) => …)`: the function form receives the parameters of the render that issued the call, so when the search timer fires and the status changes at almost the same moment, the two writes overwrite each other.
5. **Sync back into the input on back and forward**: during render, compare against the last `q` seen (`seenSearch`) and update `text` when it has changed. Do not `setState` in an effect; the project enables `@eslint-react/set-state-in-effect`.
6. **The page's own writes must not overwrite the input**: a `q` written by this page reaches the component only after the transition commits, and by then the user may have typed a few more characters. `ownSearch` remembers the value this page last wrote; when the value coming back from the URL equals it, leave the input alone.
7. **Drop the write if navigation changed the parameters while the timer ran**: record `q` when the timer starts; if it has changed when the timer fires (back, forward, a clicked menu link), the navigation result wins. The address bar changes immediately on navigation, but the router parameters update only after the transition commits, possibly after the timer fires, so check both `paramsRef` and `window.location.search`.
8. **Status filter**: pass `items` to `Select`; the value `'all'` means no filter. `onValueChange` may emit `null`; treat it as no filter. An unrecognized value in the URL also counts as no filter (`isProjectStatus`).

### Clear filters

- Whether the button shows depends on the input's current text (`hasFilters` uses `text`), so it appears as soon as the first character is typed (guideline T1.2).
- Clicking it cancels the timer, clears `text` and `ownSearch`, and removes `q` and `status` from the URL.
- The button disappears along with the filters and focus moves to the search box (guideline A6), which is why the search box has `ref={searchRef}`.

## 6. Loading the list

The pattern is the same as "Loading data in a component" in `api.md`: `useApiClient()` + `useEffect` + `AbortController`, with `setState` only in the request callbacks. A list page adds these points:

- **The request key includes the filters and the reload count**: `JSON.stringify([search, status ?? null, reloadCount])`. The result is stored together with its key, and `loading` is derived from whether the result's key matches the current key.
- **An aborted request is not a failure**: call `controller.abort()` when the filters change or the component unmounts, and check `signal.aborted` first in the callbacks, so an old result neither overwrites a new one nor shows up as an error.
- **Keep the old data while reloading**: after the key changes, `result.rows` still holds the previous batch, so the screen does not flash; the toolbar shows a small `Spinner` (guideline I4) instead of swapping the whole block for a skeleton. A failure also keeps the previous batch, so clicking "Retry" shows "old data + Spinner" rather than the skeleton.
- **Record whether this batch was fetched with filters** (`filtered`). Decide between "empty" and "no results" by this flag, not by the current filters: right after "Clear filters" is clicked, the screen still shows the old filtered result, and judging by the current filters would briefly flash "No projects yet".
- **Use `useReducer` for `reload`**: `const [reloadCount, reload] = useReducer((count: number) => count + 1, 0)`. React guarantees that the dispatch function's reference is stable, so it can go straight into the context passed to child routes. Writing `useCallback(() => setReloadCount(…), [])` in this component is rejected by the React Compiler lint rule `react-hooks/preserve-manual-memoization`.
- When the endpoint caps the number of records and does not return a total, show "Only the first N records are shown. Use search or filters to narrow the results." once the result reaches the cap (guideline T1.10). The example endpoint returns all records, so it does not need this.

## 7. The four list states

Check them in the order "failed → first load → empty → data or no results" (guidelines S1–S4) and put the result in `content`:

| State              | Condition                                            | Shows                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Failed             | The current request failed                           | An `Alert` in the destructive style. For 403, explain that permission is missing and offer no "Retry"; for other errors, say "The request failed. Please try again." and offer "Retry". After "Retry" is clicked, the button disappears and focus moves to the search box (guideline A6). Never show the raw message the backend returned |
| First load         | No data yet (`rows === undefined`)                   | The `TableSkeleton` skeleton: shaped like table rows, `role='status'`, accessible name "Loading"                                                                                                                                                                                                                                          |
| Empty              | No data, and this batch was not fetched with filters | `Empty`: icon, title, description and a "New project" button. The page header already has the primary button, so use `variant='outline'` here (guidelines L2 and S2)                                                                                                                                                                      |
| Data or no results | Anything else                                        | `DataTable`. When a filtered query finds nothing, `emptyMessage` shows "No matching projects" and "Clear filters" (guideline S3)                                                                                                                                                                                                          |

- The toolbar shows in all four states and sits outside `DataTable`, so focus can always move to the search box.
- Error copy goes in the feature's own copy group: `projects.error.title`, `projects.error.forbidden`, `projects.error.requestFailed`.
- The application shell handles having no access to the whole page (guideline S6); the 403 here is the case where the page opens but the list endpoint refuses the request.

## 8. Column definitions and row actions

- Create `columns` with `useMemo`, and put everything it uses (`t`, the formatters, `location.search`) in the dependency array.
- **The first column is the name** (guideline T1.3), a `Link` to the detail child route: `to={{ pathname: String(row.original.id), search: location.search }}`. The path is relative and keeps the query parameters, so closing the detail view returns to the same filtered result.
- A sortable column uses `DataTableColumnHeader` as its `header` and sets `enableHiding: false` (see section 3); a plain column uses the translated text directly.
- Sorting Chinese names: `sortingFn` compares with `Intl.Collator(locale)`.
- **Show status as text in a Badge** (guideline T1.4): `ProjectStatusBadge` (`status-badge.tsx`; for the code see `i18n.md`) is shared by the list and the detail view, so a given status looks the same everywhere.
- **Show an empty value as "—"**, with `text-muted-foreground`.
- **Format times in the current language** (guideline T1.6): get `locale` from `useLocale()` and create the `Intl.DateTimeFormat` with `useMemo`, so it updates when the language switches. Right-align number and amount columns and give them thousands separators (`Intl.NumberFormat`).
- **Put row actions in a "More" menu** (guideline T1.5):
  - The trigger is a ghost button with `size='icon-sm'` whose `aria-label` names the record; a button that opens a menu needs no tooltip (guideline A1).
  - "Edit" is a child route, so the menu item renders as a link: pass ``<Link to={{ pathname: `${id}/edit`, search: location.search }} />`` to `render` on `DropdownMenuItem`. The edit route is a child of the detail route, so entering from the row menu opens the detail drawer and the edit dialog together, and closing the dialog returns to the drawer.
  - "Delete" uses `variant='destructive'`, comes last, is separated by a `DropdownMenuSeparator`, and opens the delete confirmation dialog when clicked.
  - Menu items are verbs only ("Edit", "Delete"); the row they are in determines the object (guideline C3).
- The delete confirmation dialog uses component state: store the open state and the target separately (`deletion.open`, `deletion.project`) and change only `open` when closing, so the title stays the same during the exit animation. For how to write the confirmation dialog component `ProjectDeleteDialog`, see `overlay.md`; after a successful delete, refresh the list and move focus to the search box (`deletedFocusRef`).

## 9. Child routes and refreshing the list

- "New project" in the page header is a link: `<Button render={<Link to={{ pathname: 'new', search: location.search }} />} nativeButton={false}>`.
- Put `<Outlet context={outletContext} />` at the end of `PageContainer`; the create and detail child routes render there. The edit dialog stacks inside the detail drawer and reads the context the drawer passes down (see `overlay.md`). Add the context type to `types.ts`:

```ts
/** What the list page passes to its child routes (create, detail) through `<Outlet context>`. */
export interface ProjectsOutletContext {
  /** Refresh the list in the background. */
  readonly reload: () => void;
  /** Called after the detail drawer deletes a record: refresh the list, then move focus to the search box. */
  readonly afterDelete: () => void;
}
```

- Create `outletContext` with `useMemo` to keep its reference stable: effects in child routes often depend on `reload`, and a new object on every render would make them run again and again.
- Child routes read it with `useOutletContext<ProjectsOutletContext>()`. After a successful save in create or edit, call `reload()`; the list refreshes in the background and keeps the old data (for the code see `overlay.md`).
- **After a record is deleted in the detail drawer, wait for the refresh to finish before moving focus to the search box**: when the drawer closes, focus returns to the name link that opened it, but that row disappears once the list refreshes, and focus falls to the top level of the page (guideline A6). So the drawer calls `afterDelete()` first and then closes: `afterDelete` sets `focusSearchAfterReloadRef` and refreshes the list, and when `loading` turns back to `false`, the effect sees the flag and focuses the search box.
- The list page's own delete confirmation dialog does not need to wait: when it closes, it hands focus straight to the search box (`deletedFocusRef`).

## 10. Complete code

`client/pages/projects/index.tsx`. For `types.ts` see the previous section, for `status-badge.tsx` see `i18n.md`, and for `project-delete-dialog.tsx` see `overlay.md`. The code is written against the template's `DataTable`; once the application's `DataTable` has `showSelectedCount` (see section 3), pass `showSelectedCount={false}` on `<DataTable>`.

```tsx
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  FolderKanbanIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { ProjectDeleteDialog } from './project-delete-dialog.js';
import { ProjectStatusBadge } from './status-badge.js';
import {
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus,
  type ProjectsOutletContext,
} from './types.js';

function isProjectStatus(value: string | null): value is ProjectStatus {
  return PROJECT_STATUSES.some((status) => status === value);
}

export default function ProjectsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  // The search term and status filter live in the URL, so a refresh, going back or a shared link restores them.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('q') ?? '';
  const statusParam = searchParams.get('status');
  // Treat an unrecognized value as no filter.
  const status = isProjectStatus(statusParam) ? statusParam : undefined;

  // The latest query parameters: the ones this page last wrote, or the router last updated.
  // The router changes the URL in a transition, and the function form of setSearchParams only gets the parameters
  // of the render that issued it, so two nearly simultaneous writes (the search timer firing, a status change)
  // would overwrite each other. Every change therefore starts from this value.
  const paramsRef = useRef(searchParams);
  useEffect(() => {
    paramsRef.current = searchParams;
  }, [searchParams]);
  function updateParams(mutate: (params: URLSearchParams) => void): void {
    const next = new URLSearchParams(paramsRef.current);
    mutate(next);
    paramsRef.current = next;
    setSearchParams(next, { replace: true });
  }

  // The search box text lives in component state and reaches the URL only 300ms after typing stops; requests follow the URL.
  const [text, setText] = useState(urlSearch);
  // The q this page last wrote (or received from outside), and the q the previous render saw.
  const [ownSearch, setOwnSearch] = useState(urlSearch);
  const [seenSearch, setSeenSearch] = useState(urlSearch);
  if (urlSearch !== seenSearch) {
    // Compare with the previous value during render instead of calling setState in an effect.
    setSeenSearch(urlSearch);
    // Browser back/forward or a clicked link changed q: show the new value.
    // A value this page wrote itself arrives after later keystrokes (it equals ownSearch) and must not overwrite the input.
    if (urlSearch !== ownSearch) {
      setOwnSearch(urlSearch);
      setText(urlSearch);
    }
  }
  const searchTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(searchTimerRef.current), []);

  function scheduleSearch(value: string): void {
    window.clearTimeout(searchTimerRef.current);
    // While the timer runs, only outside navigation (back, forward, a clicked link) can change q: this page writes
    // only from this timer, and "Clear filters" cancels it. If navigation happened, drop this write and let the
    // navigation result stand. The address bar changes immediately, but the router's parameters update only after
    // the transition commits, possibly after the timer fires, so check both.
    const addressSearch = (): string =>
      new URLSearchParams(window.location.search).get('q') ?? '';
    const startSearch = paramsRef.current.get('q') ?? '';
    const startAddress = addressSearch();
    searchTimerRef.current = window.setTimeout(() => {
      if (
        (paramsRef.current.get('q') ?? '') !== startSearch ||
        addressSearch() !== startAddress
      ) {
        return;
      }
      setOwnSearch(value);
      updateParams((params) => {
        if (value) params.set('q', value);
        else params.delete('q');
      });
    }, 300);
  }

  function changeStatus(value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set('status', value);
      else params.delete('status');
    });
  }

  // Decide by the input's text, so "Clear filters" appears as soon as the first character is typed.
  const hasFilters = text.trim() !== '' || status !== undefined;

  function clearFilters(): void {
    window.clearTimeout(searchTimerRef.current);
    setText('');
    setOwnSearch('');
    updateParams((params) => {
      params.delete('q');
      params.delete('status');
    });
    // The "Clear filters" button disappears along with the filters; move focus to the search box (guideline A6).
    searchRef.current?.focus();
  }

  // Load the list. An effect must not call setState synchronously: store the result only in the request callbacks,
  // and derive "loading" from whether the result belongs to the current request.
  const search = urlSearch.trim();
  // Each reload() call increments the count, and the effect requests again.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Project[];
    /** Whether this batch was fetched with filters; tells "empty" apart from "no results". */
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort the request when the filters change or the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    const key = JSON.stringify([search, status ?? null, reloadCount]);
    api
      .request<{ data: Project[] }>({
        path: 'projects',
        query: { search: search || undefined, status },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setResult({
              key,
              rows: data,
              filtered: search !== '' || status !== undefined,
            });
          }
        },
        (error: unknown) => {
          // Keep the previous batch on failure: after "Retry", show the old data and a small Spinner, not the skeleton.
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, search, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  // While reloading, rows is still the previous batch.
  const rows = result?.rows;
  // Decide by the filters the displayed data was fetched with, not by the current filters:
  // right after "Clear filters" is clicked, the screen still shows the old filtered result.
  const rowsFiltered = result?.filtered ?? false;

  // After a record is deleted in the drawer, its row and the link that opened the drawer disappear once the list refreshes:
  // wait for the refresh to finish, then move focus to the search box (guideline A6).
  const focusSearchAfterReloadRef = useRef(false);
  useEffect(() => {
    if (loading || !focusSearchAfterReloadRef.current) return;
    focusSearchAfterReloadRef.current = false;
    searchRef.current?.focus();
  }, [loading]);

  // Keep the context passed to child routes stable; otherwise effects in child routes that depend on it run again and again.
  const outletContext = useMemo<ProjectsOutletContext>(
    () => ({
      reload,
      afterDelete: () => {
        focusSearchAfterReloadRef.current = true;
        reload();
      },
    }),
    [reload],
  );

  // The delete confirmation dialog uses component state. Store the open state and the target separately:
  // closing changes only open, so the title stays the same during the exit animation.
  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly project: Project | null;
  }>({ open: false, project: null });

  // The formatter and the collator follow the current language and are recreated when it switches.
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const statusItems = [
    { value: 'all', label: t('projects.filters.allStatuses') },
    ...PROJECT_STATUSES.map((value) => ({
      value,
      label: t(`projects.status.${value}`),
    })),
  ];

  const columns = useMemo<ColumnDef<Project>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        // The default sort compares character codes, so Chinese does not sort by pinyin; use the current language's collation.
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('projects.fields.name')}
          />
        ),
        cell: ({ row }) => (
          // The name links to the detail child route and keeps the current query parameters.
          <Link
            to={{ pathname: String(row.original.id), search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'owner',
        header: t('projects.fields.owner'),
        cell: ({ row }) =>
          row.original.owner ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'status',
        header: t('projects.fields.status'),
        cell: ({ row }) => <ProjectStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'updatedAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('projects.fields.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {dateFormat.format(new Date(row.original.updatedAt))}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('projects.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('projects.actions.more', {
                      name: row.original.name,
                    })}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                {/* Edit is a child route: the menu item renders as a link. */}
                <DropdownMenuItem
                  render={
                    <Link
                      to={{
                        pathname: `${row.original.id}/edit`,
                        search: location.search,
                      }}
                    />
                  }
                >
                  <PencilIcon />
                  {t('projects.actions.edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() =>
                    setDeletion({ open: true, project: row.original })
                  }
                >
                  <Trash2Icon />
                  {t('projects.actions.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [collator, dateFormat, location.search, t],
  );

  // Check in the order "failed → first load → empty → data or no results".
  let content: ReactElement;
  if (error) {
    // Retrying cannot succeed without permission, so offer no "Retry" (guideline S4).
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('projects.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('projects.error.forbidden')
            : t('projects.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                reload();
                // This button disappears after a retry; move focus to the search box (guideline A6).
                searchRef.current?.focus();
              }}
            >
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <FolderKanbanIcon />
          </EmptyMedia>
          <EmptyTitle>{t('projects.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('projects.empty.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* The page header already has the primary button, so use outline here: one primary button per view. */}
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('projects.create.action')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('projects.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearFilters}>
              {t('projects.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('projects.title')}
        description={t('projects.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('projects.create.action')}
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <InputGroup className='w-full sm:max-w-xs'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              // Pinyin being composed is not a search term: onCompositionEnd starts the timer once a candidate is confirmed.
              if (!(event.nativeEvent as InputEvent).isComposing) {
                scheduleSearch(event.target.value);
              }
            }}
            onCompositionEnd={(event) =>
              scheduleSearch(event.currentTarget.value)
            }
            placeholder={t('projects.search.placeholder')}
            aria-label={t('projects.search.label')}
          />
        </InputGroup>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={changeStatus}
        >
          <SelectTrigger
            className='w-40'
            aria-label={t('projects.filters.status')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('projects.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old data and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      <ProjectDeleteDialog
        open={deletion.open}
        onOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        project={deletion.project}
        onDeleted={() => {
          setDeletion((current) => ({ ...current, open: false }));
          reload();
        }}
        deletedFocusRef={searchRef}
      />

      {/* The create and detail child routes render here and get the list refresh function from context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function TableSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className='overflow-hidden rounded-lg border'
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
```

## 11. Verification

Try it by hand in a browser; static checks cannot find input method and focus problems:

- Type with a Chinese input method, edit in the middle, and type quickly: the input drops no characters and the cursor does not jump; about 300ms after typing stops, `?q=` appears in the address bar and the list refreshes, keeping the old data and showing a Spinner while it refreshes.
- Change the status filter within 300ms of typing: the address bar keeps both `q` and `status`.
- Refresh the page, use the browser's back and forward, and click the sidebar menu: the input, the filters and the list stay consistent.
- "Clear filters": appears as soon as the first character is typed; after a click, the button disappears, focus is on the search box, and "No projects yet" does not flash.
- All four states have appeared: the first-load skeleton, empty, no results, and failed (403 has no "Retry"; for other errors, focus is on the search box after "Retry").
- The name link, "New project" and the "Edit" menu item open their child routes; opening a child route's URL directly also works; after closing, the query parameters are still there.
- Delete a record in the detail drawer: after the list refreshes, focus is on the search box.
- At a width of 375px, the toolbar wraps and the table scrolls horizontally; everything is legible in both the light and dark themes (guidelines A4 and F6).

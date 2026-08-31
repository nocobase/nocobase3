# NocoBase Client Components

Small, reusable Portal client components composed from the template's shadcn UI foundation.

## RemoteSelect

`RemoteSelect` provides debounced remote search, paginated loading, request cancellation, retry states, and stable selected labels. It is transport-agnostic: callers provide a `loadOptions` callback and may use the NocoBase client, another REST API, GraphQL, or any other data source.

The selected value contains complete option records. Convert those records into IDs or association payloads at the owning form's submission boundary.

Pass caller-owned API identity and filter inputs through `requestKey`. Changing
that key invalidates the current option query; search text and pagination are
included automatically.

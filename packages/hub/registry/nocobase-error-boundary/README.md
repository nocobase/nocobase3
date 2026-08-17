# NocoBase error boundary

`NocoBaseErrorBoundary` contains render, lifecycle, lazy-component, and errors
forwarded through `useErrorBoundary`. It presents the same copyable, redacted
diagnostic format for root, page, and region failures.

`NocoBaseRuntimeStatus` uses that diagnostic format for gateway, maintenance,
and account states while preserving the original NocoBase error code. It is a
status view rather than a React error boundary; mount it from the template's
runtime gate instead of throwing HTTP errors into React.

Known application and command failures use the error treatment. Routine
maintenance uses a neutral waiting state and recovers from the WebSocket
application lifecycle message. A plain 503 remains actionable with a retry,
while Bad Gateway and Gateway Timeout responses remain visible errors.

The Registry item registers its user-facing copy under the
`nocobase-error-boundary` translation namespace. Both the boundary and runtime
status use the Portal SDK i18n runtime; the optional `locale` and `labels` props
remain available for an explicit locale or application-specific copy.

The development showcase at `/dev/error-boundary` demonstrates render and
forwarded asynchronous failures for all three variants, plus real
`APP_PREPARING`, `APP_COMMANDING`, `APP_STOPPED`, `APP_ERROR`, and
`USER_HAS_NO_ROLES_ERR` status payloads.

Use `root` outside application providers, `page` around routed page content, and
`region` around independently recoverable surfaces such as charts, AI output,
or third-party renderers. Keep normal API errors in their owning page or region
state instead of escalating every request failure to an error boundary.

```tsx
import { NocoBaseErrorBoundary } from "@/extensions/nocobase-error-boundary";

<NocoBaseErrorBoundary variant="region" resetKeys={[record.id]}>
  <RiskyRegion />
</NocoBaseErrorBoundary>;
```

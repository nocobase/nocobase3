# Files security

## Trust boundaries

The Core Host authenticates requests and supplies Actor/Workspace context. Request bodies, query parameters, Registry code, browsers, and object-store responses are untrusted. The Authorizer remains authoritative even when an App rewrites its editable Registry source.

Storage configuration, credentials, roots, container names, physical keys, provider state, and signing secrets are server-only. Public config contains policy limits and capabilities only.

## Temporary capabilities

Upload targets and read URLs are short-lived capabilities bound to an action, subject, workspace, and expiry. Local tokens are authenticated; S3-compatible targets are provider-signed. Send a presigned PUT only the returned target headers and file body—never Portal Authorization, Cookie, or workspace headers. Do not persist or log capability URLs or tokens.

## Content and delivery

The Kernel sets a safe `Content-Disposition` and `X-Content-Type-Options: nosniff`. Editable clients remain responsible for conservative rendering. HTML, SVG, XML, scripts, and unknown active content must not be inlined; the supplied Registry items inline only safe raster images and use explicit open/download actions otherwise.

## Deletion and maintenance

Removing an App relation does not delete a Kernel file. Call Kernel delete only after the App proves no business record still references the `fileId`. Deletion tombstones metadata before best-effort exact-object removal. Host-invoked maintenance uses database CAS claims and never lists a bucket or deletes ready files.

## Logs and errors

Expose stable error codes and safe messages without stacks or provider messages. Logs must omit signed URLs, tokens, Authorization, Cookie, credentials, private config, storage keys, and provider state. Aggregate maintenance counts are safe for metrics; provider failures are logged as generic phase failures.

## Known limitations

- The Kernel does not scan content for malware or classify sensitive data.
- Client-declared SHA-256 metadata is not a provider-verified checksum unless the backend supplies an independently verified value.
- The host must provide scheduler process-failure recovery and deployment-level leader election if required.
- Reference safety is an App responsibility because the Kernel does not own business relations.
- Browser CORS and object-store IAM are deployment responsibilities.

Report vulnerabilities through the repository's existing security reporting channel. Do not place secrets, signed URLs, or exploit data in public issues.

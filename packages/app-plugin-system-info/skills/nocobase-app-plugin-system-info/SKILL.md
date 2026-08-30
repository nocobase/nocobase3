---
name: nocobase-app-plugin-system-info
description: Use the System Info App Plugin in a NocoBase application to inspect the plugin's live server metadata.
metadata:
  short-description: Use System Info App Plugin
---

# System Info App Plugin

Use this Skill for the application capabilities provided by
`@nocobase/app-plugin-system-info`.

## Available surfaces

- App page: `/system-info`
- Server API: `GET /api/system-info`

## Usage

1. Open `/system-info` for an interactive view, or request `GET /api/system-info`.
2. Confirm the returned package, version, Node version, and server time.
3. Report availability failures explicitly; do not invent values.

## Rules

- The page and API require an authenticated application session.
- The fixed server metadata has no additional business authorization check.
  Reassess this boundary before exposing environment values, private package
  data, or user-specific information.
- The endpoint is read-only and does not expose secrets or internal tables.
- Use the supported page or API rather than reading plugin source files.
- The plugin's source Skill is under `skills/`; the App copy under
  `.agents/skills/` is synchronized output and must not be edited directly.

## Ownership

- The plugin owns the `/system-info` Route, page, Service, and response shape.
- The App owns plugin registration and where it links to the page.

## Verification

- An anonymous `GET /api/system-info` returns `401`.
- An authenticated request returns the package name, package version, current
  Node version, and a parseable server timestamp.
- Opening `/system-info` displays the same live response without inventing
  fallback values.

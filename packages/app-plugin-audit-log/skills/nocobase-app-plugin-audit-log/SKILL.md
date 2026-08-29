---
name: nocobase-app-plugin-audit-log
description: Use Audit Log App Plugin in a NocoBase application. Use when a user wants to open its page, inspect its server result, or manage its settings.
metadata:
  short-description: Use Audit Log App Plugin
---

# Audit Log App Plugin

Use this Skill for the application capabilities provided by
`@nocobase/app-plugin-audit-log`.

## Available surfaces

- Plugin page: `/audit-log`
- Settings page: `/settings/audit-log`
- Server API: `GET /api/audit-log`

## Usage

1. Identify whether the user wants the plugin page, its current server result,
   or its settings.
2. Use the corresponding application surface.
3. Confirm the result returned by the plugin.
4. Report permission, configuration, or availability failures explicitly.

## Rules

- Respect the current user's application permissions.
- Do not infer data or success that the plugin did not return.
- Prefer the plugin's supported page, settings, and API surfaces over querying
  internal tables directly.
- Replace these example capabilities with the plugin's real business
  operations and constraints as it evolves.

---
name: nocobase-app-plugin-__NOCOBASE_SHORT_NAME__
description: Use __NOCOBASE_DISPLAY_NAME__ in a NocoBase application. Use when a user wants to open its page, inspect its server result, or manage its settings.
metadata:
  short-description: Use __NOCOBASE_DISPLAY_NAME__
---

# __NOCOBASE_DISPLAY_NAME__

Use this Skill for the application capabilities provided by
`__NOCOBASE_PACKAGE_NAME__`.

## Available surfaces

- Plugin page: `/__NOCOBASE_SHORT_NAME__`
- Settings page: `/settings/__NOCOBASE_SHORT_NAME__`
- Server API: `GET /api/__NOCOBASE_SHORT_NAME__`

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

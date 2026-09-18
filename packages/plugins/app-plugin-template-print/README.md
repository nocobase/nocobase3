# @nocobase/app-plugin-template-print

An App-facing Skill for implementing template printing in NocoBase 3: generate documents from Office templates and authorized business data, with optional images, QR codes, and PDF conversion.

This package ships only guidance and reference examples. It has no Client or Server entry, routes, tables, rendering engine, or printing UI. Installing it makes implementation knowledge available to the App Agent; the requested feature is implemented later in the target App or a business plugin.

## Use in an application

Install this package as a direct development dependency of the target App using its package manager, then run `pnpm nocobase skills:sync --json` from that App. In this source workspace, use `workspace:*` for the dependency. Skill synchronization discovers direct `@nocobase/*` dependencies; no Client or Server registration is required for this package.

Ask the App Agent, for example: “Implement invoice template printing from a DOCX file, including line items and PDF download.” The [Template Print Skill](skills/nocobase-app-plugin-template-print/SKILL.md) guides scope, dependencies, data permissions, rendering, and verification. Edit the canonical files here; the App's `.agents/skills/` copy is generated local output.

The references distill the legacy `@nocobase/plugin-action-template-print` implementation. They separate historical behavior from v3 adaptation and include a source map, core code examples, Office image handling, and regression scenarios. They do not require a checkout of the legacy plugin.

## Validation

Run `pnpm --filter @nocobase/app-plugin-template-print check` and inspect the package tarball to verify the Skill and its references ship together. Like `@nocobase/app-skills`, this documentation-only package has no compilation, runtime lint, or runtime test scripts.

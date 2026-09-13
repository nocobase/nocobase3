# Built-in AI resources

This directory contains the package's built-in Employee and Tool definitions. They are registered from the static aggregators in `employees/index.ts` and `tools/index.ts` by `AIEmployeeResources`; no filesystem discovery is used for these resources.

MCP servers and Skills remain loader-managed. Skills are Markdown files named `SKILL.md` and are loaded from the published package `ai/skills` directory plus any configured `ai.skills.paths` directories.

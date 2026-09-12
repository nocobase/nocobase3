# Built-in AI resources

This directory owns the package's shipped employee, tool, skill, MCP-support, and
helper definitions. The runtime loads this directory with the same
`AIEmployeeLoader`, `ToolsLoader`, `SkillsLoader`, and `MCPLoader` used for
application resources, before loading the application's `ai/` directory.

Package builtins stay inside the package; they are not copied into an application's
`ai/` directory. Static prompts and skill manifests are packaged beside the
compiled modules so the generic loaders can discover them in production.

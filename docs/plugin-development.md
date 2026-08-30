# 插件开发

当前 NocoBase v3 插件开发流程已经改为 capability-driven 创建协议。

请阅读：

- [插件开发](./development/plugin-development.md)
- [创建并接入插件](./development/plugin-development/quick-start.md)
- [插件结构和文件所有权](./development/plugin-development/plugin-structure.md)

`plugin:create` 不再生成默认完整模板。创建插件时必须显式选择一个或多个
`--with <capability>`，或者使用 `--empty` 创建 package foundation。

# Changesets

改动了可发布 package 时，在同一个 PR 里执行：

```bash
pnpm changeset
```

交互式选择受影响的 package、SemVer 级别和变更说明，生成一份 `.changeset/<name>.md`。它只声明「这次改动该升什么版本」，不改任何版本号——版本号由发版 workflow 计算。

纯文档、测试或不影响发布产物的改动不需要 changeset。

完整流程见 [docs/branch-and-release.md](../docs/branch-and-release.md)。

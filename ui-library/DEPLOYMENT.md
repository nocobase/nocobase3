# UI Library 部署

UI Library 的 GitHub Actions workflow 会构建 `ui-library/dist`，并在 `develop` 分支更新后自动上传到阿里云 OSS Bucket `nocobase-ui-library` 的根目录，线上地址为 [http://ui.nocobase.com](http://ui.nocobase.com)。

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中配置以下两个 Repository secret：`UI_LIBRARY_ALI_OSS_ACCESS_KEY_ID` 填写阿里云 RAM AccessKey ID，`UI_LIBRARY_ALI_OSS_ACCESS_KEY_SECRET` 填写对应的 AccessKey Secret。Secret 只在发布步骤使用，不要写入仓库文件或普通变量。

Pull Request 会安装依赖、构建并检查产物，但不会上传 OSS。合并到 `develop` 后会自动发布；也可以在 **Actions → UI Library → Run workflow** 手动运行。手动运行时勾选发布只会在选择的 ref 是 `develop` 时上传，其他分支只执行构建检查。

发布使用固定版本的 `ossutil`，地域为 `cn-beijing`，上传目标是 `oss://nocobase-ui-library/`。资源、Registry 条目、Registry 索引和 `index.html` 按顺序上传；入口 HTML 和 Registry 索引使用 `Cache-Control: no-cache`，静态资源使用长期缓存。Workflow 不会删除 OSS 中已有的对象，因此上传中断时旧文件仍会保留。

如果发布失败，先查看 Actions 日志中第一个失败的步骤：构建失败通常是依赖或 TypeScript/Vite 问题，验证失败表示预期的 `dist` 文件缺失，OSS 步骤失败通常是 Secret 无效、RAM 用户没有目标 Bucket 的 `oss:PutObject` 权限或 Bucket 地域不匹配。发布成功后可检查首页、`http://ui.nocobase.com/r/registry.json` 和 `http://ui.nocobase.com/r/auth-ui.json` 是否返回 JSON；若看到 HTML，说明静态网站回退规则拦截了该路径，需要检查 OSS 对象是否位于 Bucket 根目录。

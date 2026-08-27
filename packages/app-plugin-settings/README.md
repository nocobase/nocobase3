# @nocobase/app-plugin-settings

NocoBase 3 的共享 App 设置中心。插件提供独立的设置工作区、稳定路由和设置模块注册表；业务 App 只贡献自己的设置模块，不复制设置中心壳。

## 边界

- `/settings` 和 `/settings/:moduleId` 由本插件提供。
- App 通过 `configureAppSettings()` 只声明名称和返回业务首页的路径，公共页面会读取同一份 App 级配置。
- 用户、权限、数据源、通知、工作流等模块通过注册表贡献入口。
- 未接入模块只说明归属和状态，不提供模拟保存。
- Hub 的发布、运行和资源绑定不属于 App 设置中心。

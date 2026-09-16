---
title: '邮件插件待实现清单'
description: '记录邮件插件中已确认但尚未完成的页面、权限、交互和服务能力。'
keywords: 'NocoBase,邮件插件,待实现,批量发件,邮件管理,权限'
---

# 邮件插件待实现清单

这份清单记录本轮按顺序实现的功能项及其完成状态；实现完成后仍需在 [邮件插件测试清单](./test-checklist.md) 中执行对应回归用例。

部门、组织和成员范围暂不列为当前实现项。等其他插件提供稳定的组织树、成员关系和权限范围接口后，再单独补充需求、数据准备和测试用例。

## 一、清单标识

- `[P0]`：阻塞核心页面或核心链路，优先实现
- `[P1]`：重要功能，核心链路完成后实现
- `[P2]`：增强能力，后续排期
- `[UI]`：页面和交互实现
- `[API]`：接口和数据契约实现
- `[SRV]`：服务、任务或状态机实现
- `[SEC]`：权限和安全实现
- `[NFR]`：性能、可用性或无障碍实现
- `[DOC]`：文档与清单一致性

## 二、邮件管理页

- [x] [P0][UI][SEC] MAIL-PENDING-MANAGE-001：为 `/dev/mail/management` 配置独立的 `mail.management/access` 权限，不再复用 `mail.workspace`；拥有该权限的用户当前可以查看全部邮件管理数据，不接入部门或组织范围
- [x] [P0][UI] MAIL-PENDING-MANAGE-002：邮件管理页以表格查看邮件，支持行选择、单选、多选、当前页全选和取消全选；不支持跨页或全筛选结果全选，刷新后清理失效选择
- [x] [P0][API][SRV] MAIL-PENDING-MANAGE-003：提供邮件管理页批量标记已读、未读、星标、取消星标、归档、移动和删除所需的批量操作契约
- [x] [P0][UI] MAIL-PENDING-MANAGE-004：批量操作显示明确的目标和确认信息，只处理选中邮件，不影响未选中邮件
- [x] [P0][UI][API] MAIL-PENDING-MANAGE-005：批量操作按邮件逐项返回成功、失败和部分失败结果，不回滚已成功项，失败项可以再次操作，不因重复点击产生重复操作
- [x] [P0][UI][SEC] MAIL-PENDING-MANAGE-006：批量删除遵循普通删除和 Trash 永久删除规则，永久删除前显示二次确认；远端或本地部分失败时保留可追踪失败状态，不显示为成功
- [x] [P1][UI][API] MAIL-PENDING-MANAGE-007：管理页支持按主题、摘要、发件人和收件人搜索，前后端搜索字段和结果范围保持一致
- [x] [P1][UI][NFR] MAIL-PENDING-MANAGE-008：管理页在大量邮件、批量选择和批量操作期间保持可用，筛选或分页请求不会覆盖新结果
- [x] [P1][SEC] MAIL-PENDING-MANAGE-009：独立权限生效后，未获授权用户不能打开页面、读取管理数据或调用批量操作接口

## 三、批量发件页

- [x] [P0][UI] MAIL-PENDING-BULK-001：新增 `/dev/mail/bulk-send` 页面并接入邮件导航
- [x] [P0][UI][SEC] MAIL-PENDING-BULK-002：批量发件页按当前用户权限加载可发送账号，不展示其他用户账号或发件地址
- [x] [P0][UI] MAIL-PENDING-BULK-003：批量发件页提供发件账号和发件地址选择，默认使用账号主地址并支持可发送别名
- [x] [P0][UI] MAIL-PENDING-BULK-004：批量收件人支持逐行、逗号和分号录入，解析后自动去重，可以逐项查看、删除、清空和重新编辑；非法地址被明确标记并阻止提交
- [x] [P0][API][SRV] MAIL-PENDING-BULK-005：批量发件为每位收件人创建独立 submission，不在不同收件人之间共享 To、CC 或 BCC
- [x] [P0][UI] MAIL-PENDING-BULK-006：发送前展示账号、发件人、收件人数量、收件人地址、主题、正文和附件摘要，并在确认后才提交
- [x] [P0][UI][API] MAIL-PENDING-BULK-007：批量发送结果按收件人展示 accepted、failed、unknown、pending 和 cancelled 状态
- [x] [P0][SRV][API] MAIL-PENDING-BULK-008：批量发送重试遵循逐收件人幂等规则，已接受的 submission 不会被重复创建，failed 可以重试，unknown 不自动重试
- [x] [P1][UI] MAIL-PENDING-BULK-009：批量发件页支持签名、模板、富文本、附件和定时发送，并保持每个 submission 的内容一致
- [x] [P1][UI][NFR] MAIL-PENDING-BULK-010：100 位收件人的录入、预览、提交和结果展示不会造成明显卡顿、重复请求或状态丢失

## 四、工作台与邮件组织

- [x] [P0][UI] MAIL-PENDING-CENTER-001：工作台在没有 Provider 文件夹时仍显示「收件箱」「已发送」「草稿箱」「垃圾箱」「垃圾邮件」「归档」等默认文件夹
- [x] [P0][UI] MAIL-PENDING-CENTER-002：当前账号的自定义文件夹显示在默认文件夹之后，切换账号后只显示当前账号的自定义文件夹；自定义文件夹按 Provider 返回顺序展示，没有顺序时按名称排序
- [x] [P1][UI][API] MAIL-PENDING-CENTER-003：文件夹筛选和本地标签筛选可以同时生效，分别取消时结果和页面状态保持一致
- [x] [P1][UI][API] MAIL-PENDING-CENTER-004：工作台和邮件管理页支持按主题、摘要、发件人显示名称、发件人地址、收件人显示名称和收件人地址包含搜索，不匹配正文
- [x] [P1][UI] MAIL-PENDING-CENTER-005：同一会话内的多封邮件支持逐封折叠和展开，折叠状态保留必要摘要
- [x] [P1][UI][API] MAIL-PENDING-CENTER-006：Trash 中的邮件支持永久删除，执行前显示二次确认，取消不会改变邮件；远端或本地部分失败时保留可追踪失败状态，不显示为成功

## 五、发送、编辑和草稿

- [x] [P0][UI] MAIL-PENDING-SEND-001：进入新建发件表单时，当前账号的默认签名自动插入正文；没有默认签名时不自动插入
- [x] [P0][UI] MAIL-PENDING-SEND-002：切换签名时替换原有签名，不叠加旧签名；切换为无签名时移除原签名
- [x] [P0][UI] MAIL-PENDING-SEND-003：模板覆盖已有主题或正文前显示二次确认，取消时保留原内容
- [x] [P1][UI] MAIL-PENDING-SEND-004：富文本编辑器支持字号、字体等级（标题级别）、链接和插入图片，并在编辑、保存、预览和发送后保持一致
- [x] [P1][SEC] MAIL-PENDING-SEND-005：粘贴 HTML、链接和图片资源经过安全清洗，不执行危险标签、属性、协议或资源地址
- [x] [P0][UI] MAIL-PENDING-SEND-006：当前 Composer、`/dev/mail/send` 和批量发件页使用发件人选择框，列出所选账号的主地址和全部可发送别名；不显示独立的发件身份选择器
- [x] [P1][UI] MAIL-PENDING-SEND-007：发件人和 To、CC、BCC 收件人地址区域支持收缩和展开，收缩时显示数量或摘要，展开和编辑不丢失地址
- [x] [P0][SRV][API] MAIL-PENDING-DRAFT-001：本地草稿作为唯一可编辑来源，所有 Provider 都可以创建、编辑、自动保存、恢复和发送本地草稿
- [x] [P1][SRV][API] MAIL-PENDING-DRAFT-002：Gmail 和 Microsoft 的远端草稿作为可选同步镜像，远端失败不阻断本地草稿
- [x] [P1][SRV][API] MAIL-PENDING-DRAFT-003：本地草稿与远端草稿冲突时保留本地未同步修改，显示明确冲突状态，并提供查看远端版本或放弃本地修改的入口

## 六、本地标签和 Provider 边界

- [x] [P0][SRV][API] MAIL-PENDING-LABEL-001：本地标签的创建、编辑、删除和邮件关联完全由邮件插件管理
- [x] [P0][SEC] MAIL-PENDING-LABEL-002：本地标签操作不调用 Gmail、Microsoft 或 IMAP/SMTP 的 Provider 标签接口
- [x] [P1][SRV] MAIL-PENDING-LABEL-003：Provider 原生标签或文件夹变化不会覆盖、创建或删除本地标签
- [x] [P1][DOC] MAIL-PENDING-SCOPE-001：功能清单、README、路由清单和测试清单统一反映本地标签、草稿、管理页权限和批量发件页的最终状态

## 七、本轮已实现的增强能力

- [x] [P1][UI][API][SRV] MAIL-PENDING-SYNC-001：账号页支持配置每个账号的自动同步间隔，服务端按上次同步时间判断到期，Push、手动同步和自动同步仍由活动任务约束去重
- [x] [P1][UI][SEC] MAIL-PENDING-CONTENT-001：邮件 HTML 正文中的 CID 内联图片只匹配当前邮件的 inline 附件，并通过当前用户可校验的附件接口加载
- [x] [P1][UI][API] MAIL-PENDING-SIGNATURE-001：签名管理支持安全富文本编辑、字号、标题、链接和插入图片，并同时保存 HTML 与纯文本
- [x] [P1][PROVIDER][DOC] MAIL-PENDING-PROVIDER-001：Gmail、Microsoft 和 IMAP/SMTP 具备 Provider 兼容性契约测试，并提供第三方 Provider 开发指南

## 八、路由和页面命名

- [x] [P1][UI] MAIL-PENDING-ROUTE-001：管理员操作日志页面按产品命名调整为 `/settings/mail/operation-logs`，并与导航标题、页面组件和测试清单一致
- [x] [P1][UI] MAIL-PENDING-ROUTE-002：邮件管理页、批量发件页和管理员操作日志页的导航标题、权限提示和空状态文案清晰区分

## 九、暂不纳入当前清单

- [ ] [BOUNDARY] 部门、组织、成员树和组织管理员范围，等待其他插件提供组织能力后再评估
- [ ] [BOUNDARY] 从表格选中业务记录后批量生成邮件收件人，当前不等同于独立批量发件页

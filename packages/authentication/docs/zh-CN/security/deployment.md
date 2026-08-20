# 部署与安全

authentication 提供认证机制，但生产安全仍取决于应用如何配置 secret、URL、
Cookie、缓存和密码重置通道。

## Secret

`secret` 是强制配置。应从环境变量或 secret manager 读取：

```ts
const secret = env.string('AUTH_SECRET');
if (!secret) {
  throw new Error('AUTH_SECRET is required.');
}
```

不要：

- 把 secret 写入源码或提交到 Git；
- 使用示例中的 development secret 上线；
- 把 secret 注入浏览器构建产物；
- 在同一部署集群的实例之间使用不同 secret；
- 无迁移计划地直接轮换 secret。

## baseURL 与反向代理

生产环境应配置外部可访问的 HTTPS URL：

```ts
createAuthentication({
  connection,
  secret,
  baseURL: 'https://apps.example.com/my-app/api/auth',
});
```

这里应使用浏览器看到的公开地址，而不是容器内部地址。反向代理需要正确转发
Host、协议和 Cookie 相关 Header。

## Cookie

应用部署在子路径时，把 Cookie path 设置为应用公开 mount point：

```ts
advanced: {
  cookiePrefix: 'my_app',
  defaultCookieAttributes: {
    path: '/my-app',
    secure: true,
    sameSite: 'lax',
  },
}
```

需要根据部署拓扑评估：

- `secure` 是否只允许 HTTPS；
- `sameSite` 是否满足登录 callback 或跨站嵌入；
- `domain` 是否会把 Cookie 扩散到不必要的子域；
- `path` 是否过宽或无法覆盖应用 API；
- 多个应用是否使用不同 `cookiePrefix`。

不要为了修复 callback 问题直接把 Cookie 范围扩大到整个父域。

## Session storage

如果启用：

```ts
session: {
  storeSessionInDatabase: true,
}
```

session 记录保存在数据库。仍需为 Better Auth secondary storage 和限流选择
符合部署模型的 cache provider。

单进程开发环境可以使用内存缓存。多实例生产环境通常应使用 Redis 等共享
provider，否则实例之间的一次性验证状态和限流计数可能不一致。

## 密码重置

客户端已经提供 `requestPasswordReset()`，但生产环境还必须：

1. 配置服务端发送重置邮件的 callback；
2. 使用允许列表控制 redirect URL；
3. 实现重置密码页面；
4. 避免通过响应泄露邮箱是否注册；
5. 验证 token 过期和一次性消费行为；
6. 对请求入口配置共享限流。

完成这些配置前，不应向最终用户开放“忘记密码”入口。

## 错误与日志

- 不记录密码、session token、verification value、access token 或 refresh token。
- 对外返回稳定的认证错误，不暴露数据库和 adapter 内部错误。
- 记录安全审计事件时使用 user ID、请求 ID 和结果，不复制凭据。
- `databaseAdapter({ debugLogs: true })` 只用于受控诊断，不应作为生产默认值。

## 上线检查清单

- [ ] `AUTH_SECRET` 来自安全配置，并在所有实例保持一致。
- [ ] `baseURL` 是真实 HTTPS 公网地址。
- [ ] Cookie prefix、path、domain、secure、sameSite 已按部署路径验证。
- [ ] 认证 migration 已在目标数据库执行。
- [ ] 多实例环境使用共享 secondary storage 和限流 counter。
- [ ] 登录、注册、退出、session 查询和密码重置均通过真实浏览器验证。
- [ ] 匿名请求无法访问 `required()` 保护的业务接口。
- [ ] 日志和错误响应不包含凭据或 token。
- [ ] 应用关闭时释放 Caching 等运行期资源。

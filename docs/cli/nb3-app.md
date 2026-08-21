# nb3 app

`nb3 app` 用来创建、开发和部署业务 App。

App 是用户实际开发的应用，比如 CRM、客服工作台、数据看板。

## 命令

```text
nb3 app create    创建本地 App 源码
nb3 app dev       本地开发 App
nb3 app deploy    部署 App 到 Hub
nb3 app pull      从 Hub 拉取已有 App
nb3 app list      查看 Hub 中的 App
nb3 app info      查看 App 信息
nb3 app destroy   删除 App
nb3 app config    查看或修改 App 配置
```

第一版最常用的是：

```text
nb3 app create
nb3 app dev
nb3 app deploy
```

## 创建 App

```bash
nb3 app create crm
cd crm
```

基于 `@nocobase/app-template-default` 生成一个本地 App 源码目录：

```text
crm/
  .nb3/
  client/
  server/
  package.json
  ...
```

App 源码可以放在任意位置，不需要放在 Hub 目录里。

## 本地开发

```bash
nb3 app dev
```

如果只是本地开发，到这里就够了，不需要安装 Hub。

## 部署 App

部署需要一个目标 Hub。

部署到本地 Hub：

```bash
nb3 app deploy --hub http://localhost:3000
```

部署到远端 Hub：

```bash
nb3 app deploy --hub https://apps.example.com
```

如果当前 App 已经记录了 Hub 地址，后续可以直接执行：

```bash
nb3 app deploy
```

## 拉取已有 App

如果 Hub 中已经有 App，可以拉取到本地开发：

```bash
nb3 app pull crm ./crm
cd crm
nb3 app dev
```

拉取后，本地目录会记录对应的 Hub 和 App 信息。

## 和 nb3 hub 的关系

`nb3 app` 不负责启动 Hub。

如果需要本地 Hub，先使用：

```bash
nb3 hub create my-hub
cd my-hub
nb3 hub start
```

然后回到 App 目录部署：

```bash
cd ../crm
nb3 app deploy --hub http://localhost:3000
```

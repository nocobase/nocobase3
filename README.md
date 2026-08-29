举个例子，比如 config.yml 在生产环境里是

```bash
|- <app>
  |- dist
  |- config.yml
```

本地开发是这样的

```bash
|- <app>
  |- client
  |- server
  |- config.yml
```

本地的 config.yml，随便改，不会覆盖生产环境的 config.yml
hub 里可以修改 app 的 config.yml，但是 app 不一定有全部 config.yml 的修改权限的

import type { AuthorizationExampleResource } from './en-US.js';

const zhCN: AuthorizationExampleResource = {
  title: '权限示例',
  intro:
    '这里的每条任务都归创建它的人所有。种子写入的权限集给每个已登录用户授予 `recordsIOwn` 记录范围，因此普通账号只能读取、修改和删除自己的记录。',
  intro2:
    '超级用户跳过授权判定，可以看到所有人的任务。新增任务走插件自己的路由，由服务端根据当前身份写入 owner，而不是取自请求体。',
  newTask: '要做什么？',
  add: '新增',
  done: '完成',
  reopen: '重新打开',
  delete: '删除',
  loading: '正在加载任务…',
  empty: '还没有任务。',
  forbidden: '你在该数据表上没有任何授权',
  error: '出错了。',
  statusOpen: '进行中',
  statusDone: '已完成',
  owner: '所有者',
};

export default zhCN;

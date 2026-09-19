import type { AuditExampleResource } from './en-US.js';
const zhCN: AuditExampleResource = {
  title: '客户审计示例',
  description: '管理自己的客户并查看操作历史，历史中的联系电话已脱敏。',
  name: '客户名称',
  phone: '联系电话',
  actions: '操作',
  create: '新增客户',
  edit: '编辑',
  save: '保存修改',
  cancel: '取消',
  delete: '删除',
  logs: '操作日志',
  allLogs: '查看全部日志',
  empty: '暂无客户。',
  noLogs: '选择操作日志以加载记录。',
  saved: '客户已保存。',
  deleted: '客户已删除，历史日志已保留。',
  loadFailed: '客户加载失败。',
  saveFailed: '修改未能保存，请刷新客户资料后重试。',
  logsFailed: '日志加载失败，请勿重复提交客户操作。',
  action: { created: '新增客户', updated: '编辑客户', deleted: '删除客户' },
};
export default zhCN;

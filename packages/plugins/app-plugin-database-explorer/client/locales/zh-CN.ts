import type { DatabaseExplorerResource } from './en-US.js';

const zhCN: DatabaseExplorerResource = {
  nav: {
    databaseExplorer: '数据库浏览器',
  },
  page: {
    title: '数据库浏览器',
    description:
      '查看应用配置的数据库连接、每个连接上的数据表，以及数据表的字段。此页面只读，不会修改任何内容。',
  },
  sections: {
    connections: '连接',
    collections: '数据表',
    detail: '数据表详情',
  },
  tabs: {
    fields: '字段',
    columns: '物理列',
  },
  fields: {
    name: '字段',
    type: '类型',
    nullable: '可为空',
    key: '键',
    default: '默认值',
    target: '关联目标',
  },
  columns: {
    name: '列',
    nativeType: '原生类型',
    nullable: '可为空',
    length: '长度',
    collation: '排序规则',
  },
  schemaManagement: {
    managed: '受管理',
    external: '外部',
  },
  labels: {
    default: '默认',
    primaryKey: '主键',
    unique: '唯一',
    warnings: '解析警告',
    yes: '是',
    no: '否',
  },
  actions: {
    searchCollections: '搜索数据表',
  },
  states: {
    loading: '加载中',
    truncated: '该连接的数据表数量超过页面可加载的上限。',
  },
  empty: {
    connections: '未配置任何连接。',
    collections: '该连接上没有数据表。',
    detail: '选择一个数据表以查看其字段。',
    fields: '该数据表未声明字段。',
    columns: '该数据表没有物理列。',
  },
  errors: {
    unknown: '发生了未知错误。',
    databaseUnavailable: '该应用未配置数据库。',
    forbidden: '你没有数据库浏览器的访问权限。',
    connectionNotFound: '该连接未配置。',
    connectionUnavailable: '应用无法打开该连接，其驱动可能未注册。',
    connectionUnreachable: '无法读取该连接。',
    schemaReadDenied: '该数据库账号无权读取此模式。',
    collectionNotFound: '该连接上不存在此数据表。',
    invalidListOptions: '该连接不接受这些列表参数。',
    invalidCursor: '该页结果已失效，请重新搜索。',
  },
};

export default zhCN;

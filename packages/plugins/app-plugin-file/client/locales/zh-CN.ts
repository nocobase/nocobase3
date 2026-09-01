import type { FileClientResource } from './en-US.js';

const zhCN: FileClientResource = {
  common: {
    actions: {
      cancel: '取消',
      close: '关闭',
      download: '下载',
      nextFile: '下一个文件',
      previousFile: '上一个文件',
      preview: '预览',
      remove: '移除',
      retry: '重试',
    },
    states: {
      done: '已完成',
      failed: '失败',
      noFiles: '暂无文件。',
      pending: '等待上传',
      uploading: '上传中',
    },
    visibility: {
      private: '私有',
      public: '公开',
    },
  },
  errors: {
    accessCheckFailed: '访问检查失败（{{status}}）{{detail}}',
    checkAccessUrlFailed: '无法检查访问地址。',
    createAccessUrlFailed: '无法创建文件访问地址。',
    downloadFailed: '文件下载失败。',
    downloadFileFailed: '无法下载文件。',
    fileTypeNotAllowed: '不允许上传此文件类型。',
    loadPreviewFailed: '无法加载文件预览。',
    maxFilesReached: '已达到文件数量上限。',
    previewRequestFailed: '预览请求失败（{{status}}）。',
    removeFailed: '文件移除失败。',
    removeFileFailed: '无法移除文件。',
    shortLivedUrlFailed: '无法创建临时访问地址。',
    sizeExceeded: '文件大小超过 {{size}}。',
    uploadFailed: '文件上传失败。',
    urlNotAllowed: '不允许使用此文件地址。',
  },
  list: {
    noExtension: '无扩展名',
  },
  preview: {
    downloadFile: '下载文件',
    loading: '正在加载预览...',
    officeLoadFailed: 'Office Online 无法加载此文件。',
    officePublicUrlRequired:
      'Office Online 需要可通过互联网访问的绝对文件地址。',
    unavailable: '此文件类型暂不支持预览。',
  },
  upload: {
    chooseFile: '选择文件',
    chooseFiles: '选择多个文件',
  },
  demo: {
    access: {
      check: '检查访问地址',
      checking: '正在检查访问...',
      description:
        '可以直接打开公开文件内容，也可以创建并测试私有文件的临时访问地址。页面不会显示令牌。',
      expiresAt: '过期时间：{{expiration}}',
      openPrivate: '打开私有文件',
      openPublic: '打开公开文件：{{filename}}',
      privateDescription:
        '设置较短的有效期，等待地址过期后再次检查，以查看服务端响应。',
      privateEmpty: '暂无可用的私有订单文件。',
      privateFiles: '私有文件',
      publicEmpty: '暂无可用的公开订单文件。',
      publicFiles: '公开文件',
      requestPrivate: '申请临时访问地址：{{filename}}',
      serverDefaultExpiration: '使用服务端默认有效期',
      title: '访问演示',
      ttl: '临时访问地址有效期（秒）',
      valid: '临时访问地址仍然有效。',
    },
    avatar: {
      description: '默认私有，仅允许图片，最多上传一个文件。',
      empty: '尚未上传个人头像。',
      previewEmpty: '暂无可预览的个人头像。',
      title: '一对一个人头像',
      upload: '上传个人头像',
    },
    description:
      '此页面通过真实的个人资料和订单记录演示标准文件路由，无需安装 Registry item。',
    errors: {
      loadAttachments: '无法加载示例或附件列表。',
      loadDemo: '无法加载文件演示。',
      loadExamples: '无法加载文件示例（{{status}}）。',
      missingExamples: '文件示例响应缺少 data 数据。',
      servicesUnavailable: '应用的存储或数据库服务不可用。',
      signInRequired: '请登录后访问文件演示。',
      systemAdministratorRequired: '文件演示管理需要系统管理员权限。',
      unavailableTitle: '文件演示不可用',
      unableToLoadTitle: '无法加载文件演示',
    },
    eyebrow: '插件自有运行时页面',
    legend: {
      label: '文件访问说明',
      privateDescription: '会先申请一个有有效期的地址再访问。',
      publicDescription: '会直接打开文件内容路由。',
    },
    loading: '正在加载文件示例和附件...',
    order: {
      description:
        'Markdown 使用 GFM；Office 和 OpenDocument 文件仅在地址可通过互联网访问时使用 Office Online，本地地址会回退为下载。',
      empty: '尚未上传订单附件。',
      previewEmpty: '暂无可预览的订单附件。',
      title: '一对多订单附件',
      upload: '上传订单附件',
      uploadAccess: '上传可见性',
      usage: '订单 {{order}} 已使用 {{count}} / {{limit}} 个文件。',
    },
    previewField: '只读预览字段',
    stats: {
      available: '可用',
      order: '订单',
      profile: '个人资料',
      profileValue: '{{name}} · ID {{id}}',
      storage: '存储和数据库',
    },
    title: '文件演示',
  },
};

export default zhCN;

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
    createAccessUrlFailed: '无法创建文件访问地址。',
    downloadFailed: '文件下载失败。',
    fileTypeNotAllowed: '不允许上传此文件类型。',
    loadPreviewFailed: '无法加载文件预览。',
    maxFilesReached: '已达到文件数量上限。',
    previewRequestFailed: '预览请求失败（{{status}}）。',
    removeFailed: '文件移除失败。',
    sizeExceeded: '文件大小超过 {{size}}。',
    uploadFailed: '文件上传失败。',
    urlNotAllowed: '不允许使用此文件地址。',
  },
  list: {
    noExtension: '无扩展名',
  },
  inventory: {
    nav: '文件',
    title: '文件',
    refresh: '刷新',
    metrics: {
      sources: '文件来源',
      records: '文件记录',
      unavailable: '不可用',
    },
    sources: {
      title: '来源',
      loading: '正在加载来源...',
      empty: '暂无已注册的数据库文件来源。',
      recordCount: '{{count}} 个文件',
      unavailable: '来源不可用',
    },
    files: {
      loading: '正在加载文件...',
      empty: '暂无文件记录。',
      noSource: '未选择文件来源。',
      unavailable: '文件不可用',
      columns: {
        file: '文件',
        disk: '存储盘',
        size: '大小',
        visibility: '可见性',
        created: '创建时间',
        updated: '更新时间',
      },
    },
    pagination: {
      total: '{{count}} 条文件记录',
      page: '{{page}} / {{totalPages}}',
      previous: '上一页',
      next: '下一页',
    },
    errors: {
      loadSources: '无法加载文件来源。',
      loadFiles: '无法加载此来源中的文件。',
      sourceUnavailable: '无法读取已注册的文件数据表。',
      sourcesUnavailable: '文件来源不可用',
    },
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
};

export default zhCN;

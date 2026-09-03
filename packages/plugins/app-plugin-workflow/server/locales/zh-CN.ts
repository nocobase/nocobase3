import type { WorkflowServerResource } from './en-US.js';

const zhCN: WorkflowServerResource = {
  errors: {
    badRequest: '工作流请求无效。',
    conflict: '工作流请求与当前状态冲突。',
    serviceUnavailable: '工作流服务不可用。',
    notConfigured: '工作流服务尚未配置。',
    internal: '服务器内部错误。',
    enabledBoolean: 'enabled 必须为布尔值',
    workflowNotFound: '未找到请求的工作流。',
    invalidInput: '工作流输入无效。',
    parentRunNotFound: '未找到父工作流运行记录。',
    stackLimitExceeded: '工作流调用栈超出限制。',
    inputTooLarge: '工作流输入过大。',
  },
};

export default zhCN;

import type { MailServerResource } from './en-US.js';

const zhCN: MailServerResource = {
  errors: {
    accessDenied: '需要邮件访问权限。',
    idempotencyConflict: '该幂等键已关联到另一个请求。',
    invalidRequest: '邮件请求无效。',
    requestFailed: '无法完成邮件请求。',
    syncRunNotFound: '未找到邮件同步任务。',
    messageNotFound: '未找到邮件。',
    authorizationStateRequired: '必须提供邮件授权状态。',
  },
};

export default zhCN;

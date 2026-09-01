import type { HubResource } from './en-US.js';
import { applicationsZhCN } from './resources/applications.js';
import { membersZhCN } from './resources/members.js';
import { operationsZhCN } from './resources/operations.js';

const zhCN: HubResource = {
  navigation: {
    applications: '应用',
    deployments: '部署',
    audit: '审计日志',
    members: '成员与角色',
  },
  ...applicationsZhCN,
  ...operationsZhCN,
  ...membersZhCN,
};

export default zhCN;

import chartGenerator from './chartGenerator.js';
import executeFrontendTool from './executeFrontendTool.js';
import formFiller from './formFiller.js';
import getSkill from './getSkill.js';
import knowledgeBaseRetrieve from './knowledge-base-retrieve.js';
import loadFrontendTool from './loadFrontendTool.js';
import dispatchSubAgentTask from './sub-agents/dispatch-sub-agent-task.js';
import getAIEmployee from './sub-agents/get-ai-employee.js';
import listAIEmployees from './sub-agents/list-ai-employees.js';
import subAgentWebSearch from './subAgentWebSearch.js';
import suggestions from './suggestions.js';

const tools = [
  chartGenerator,
  executeFrontendTool,
  formFiller,
  getSkill,
  knowledgeBaseRetrieve,
  loadFrontendTool,
  dispatchSubAgentTask,
  getAIEmployee,
  listAIEmployees,
  subAgentWebSearch,
  suggestions,
] as const;

export default tools;

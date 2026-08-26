export { default as bootstrap } from './bootstrap.js';
export { default as registerRoutes } from './routes/index.js';
export {
  createAIEmployeeContextMiddleware,
  createAIEmployeeRuntime,
  initializeAIEmployee,
  loadResources,
  registerAIEmployeeAppRoutes,
} from './runtime.js';
export type {
  AIEmployeeEnv,
  AppDeps,
  InstallAIEmployeeOptions,
  ResourceLoadOptions,
  ResourceLoadSummary,
} from './runtime.js';
export { initializeAIEmployeeCollections } from '../database/collections/index.js';

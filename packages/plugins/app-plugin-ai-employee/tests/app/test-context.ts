import {
  createPluginRuntime,
  initializePluginRuntimeResources,
} from '../../server/runtime.js';
import { createTestAppDeps } from './test-app-deps.js';

export function createTestAIEmployeeRuntime() {
  const deps = createTestAppDeps();
  initializePluginRuntimeResources(deps, { loadResources: false });
  return createPluginRuntime({ deps });
}

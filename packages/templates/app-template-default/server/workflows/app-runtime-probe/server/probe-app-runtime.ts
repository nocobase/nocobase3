import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';

interface RuntimeProbeResult {
  [key: string]: WorkflowRunJsonValue;
  available: true;
  capability: string;
  generatedId: string;
}

export const run: WorkflowRunFunction = (
  _rawArgs: unknown,
  runtime,
): WorkflowRunJsonValue => {
  runtime.signal.throwIfAborted();

  const idGenerator = runtime.services.resolve(idGeneratorToken);
  const result: RuntimeProbeResult = {
    available: true,
    capability: '@nocobase/app-server/id-generator',
    generatedId: idGenerator.generateString(),
  };

  runtime.logger.info('Application runtime capability probe succeeded');
  return result;
};

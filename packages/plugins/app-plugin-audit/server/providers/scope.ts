import { NodeAuditScopeCarrier } from '../scope.js';
import { TrustedAuditRuntime, type AuditRuntimeOptions } from '../runtime.js';

export interface AuditScopeResources {
  readonly runtime: TrustedAuditRuntime;
  dispose(): void;
}

/** G20 owns registration. Each App provider creates and disposes its own resources. */
export function createAuditScopeResources(
  options: Omit<AuditRuntimeOptions, 'carrier'>,
): AuditScopeResources {
  const carrier = new NodeAuditScopeCarrier(options.appId);
  const runtime = new TrustedAuditRuntime({ ...options, carrier });
  return Object.freeze({
    runtime,
    dispose: (): void => runtime.dispose(),
  });
}

import type { AuditDeploymentRequirements } from '../../server/contracts.js';
import { AuditCaptureCatalog } from '../../server/capture-catalog.js';
import { LocalAuditHealthService } from '../../server/health-service.js';
import { AuditReadiness } from '../../server/providers/readiness.js';
import { PersistentAuditSettingsService } from '../../server/settings-service.js';
import type { PortableFixture } from './database-fixtures.js';

interface CaptureServices {
  health: LocalAuditHealthService;
  catalog: AuditCaptureCatalog;
  readiness: AuditReadiness;
  settings: PersistentAuditSettingsService;
}

/** Assemble policy services without initializing a database or registering collectors. */
export function createCaptureServices(
  stores: readonly Pick<PortableFixture, 'connection' | 'store'>[],
  requirements: AuditDeploymentRequirements = {
    auditRequired: false,
    requiredDataSources: [],
    mandatorySources: [],
  },
): CaptureServices {
  const health = new LocalAuditHealthService(() => undefined);
  const catalog = new AuditCaptureCatalog();
  const readiness = new AuditReadiness({
    stores,
    catalog,
    health,
    requirements,
  });
  const settings = new PersistentAuditSettingsService({
    ...stores[0],
    readiness,
    health,
    defaults: {
      enabled: true,
      sources: { http: 'declared-routes', runtime: 'disabled', database: [] },
    },
  });
  return { health, catalog, readiness, settings };
}

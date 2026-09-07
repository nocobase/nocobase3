export type {
  AuditSettingsMetadata,
  AuditSettingsResponse,
  AuditDeploymentRequirements,
  AuditCaptureMetadata,
  AuditDeclaredRoute,
  AuditTablePolicy,
  AuditErrorDto,
  AuditEventDto,
  AuditEventLookup,
  AuditEventsPage,
  AuditEventsQuery,
  AuditHealthDto,
  AuditHealthQuery,
  AuditOperationQuery,
  AuditSettings,
  AuditSettingsUpdate,
} from '../server/contracts.js';

import type { AuditEventsQuery } from '../server/contracts.js';
/** Query and selection options for the public audit events view. */
export interface AuditEventsViewProps {
  readonly query: AuditEventsQuery;
  readonly onEventSelect?: (eventId: string) => void;
}

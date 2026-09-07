import type { ReactElement } from 'react';
import { AuditEventsView } from '@nocobase/app-plugin-audit/client/components';
import type { AuditEventsViewProps } from '@nocobase/app-plugin-audit/client/components';

/** Application-owned layout; event loading and authorization remain in the runtime. */
export function AuditEventsPanel(props: AuditEventsViewProps): ReactElement {
  return (
    <section className='space-y-4'>
      <AuditEventsView {...props} />
    </section>
  );
}

import type { ReactElement } from 'react';

import type {
  AuthorizationOptions,
  AuthorizationSubject,
  PermissionSetAssignment,
} from '../../authorization-client.js';
import { ErrorBox, NoticeBox } from '../../components/feedback.js';
import { DetailHeader, DetailTabs } from '../../components/management-ui.js';
import {
  canAssignSubjectType,
  type PermissionSetCapabilities,
} from '../../components/permission-set-access.js';
import { Button } from '../../components/ui/button.js';
import type { UserDirectory } from '../../components/user-directory.js';
import { Assignments } from './assignments-tab.js';
import {
  detailBadgeLabel,
  detailBadgeTone,
  detailSummary,
  humanize,
  permissionCountFromDraft,
} from './labels.js';
import { PermissionsSummary } from './permissions-tab.js';
import { SetBadge } from './set-badge.js';
import type { DetailSection, Draft } from './types.js';

export function PermissionSetDetail({
  options,
  directory,
  draft,
  capabilities,
  assignments,
  section,
  busy,
  error,
  onSection,
  onBack,
  onEdit,
  onDelete,
  onAssign,
  onRevoke,
}: {
  options: AuthorizationOptions;
  directory: UserDirectory;
  draft: Draft;
  capabilities: PermissionSetCapabilities;
  assignments: readonly PermissionSetAssignment[];
  section: DetailSection;
  busy: boolean;
  error?: string;
  onSection: (value: DetailSection) => void;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAssign: (subjects: readonly AuthorizationSubject[]) => Promise<void>;
  onRevoke: (ids: readonly string[]) => Promise<void>;
}): ReactElement {
  // An unrestricted set has no permissions to configure, so its detail view is the assignments alone.
  const detailSection = capabilities.unrestricted ? 'assignments' : section;
  return (
    <div className='space-y-5'>
      {error ? <ErrorBox value={error} /> : null}
      <DetailHeader
        onBack={onBack}
        title={draft.title || humanize(draft.key) || 'New permission set'}
        subtitle={detailSummary(draft, assignments, capabilities.unrestricted)}
        badge={
          <SetBadge tone={detailBadgeTone(capabilities)}>
            {detailBadgeLabel(capabilities)}
          </SetBadge>
        }
        actions={
          <>
            {capabilities.canUpdate ? (
              <Button variant='outline' onClick={onEdit}>
                Edit
              </Button>
            ) : null}
            {draft.originalKey && capabilities.canDelete ? (
              <Button
                className='text-destructive hover:text-destructive'
                variant='ghost'
                disabled={busy}
                onClick={onDelete}
              >
                Delete
              </Button>
            ) : null}
          </>
        }
      />
      {capabilities.protectedSet && !capabilities.unrestricted ? (
        <NoticeBox>
          Required administration permissions and assignments are preserved so
          administrators cannot be locked out.
        </NoticeBox>
      ) : null}
      {capabilities.unrestricted ? null : (
        <DetailTabs
          value={detailSection}
          onChange={(value) => onSection(value as DetailSection)}
          items={[
            {
              value: 'permissions',
              label: 'Permissions',
              count: permissionCountFromDraft(draft),
            },
            {
              value: 'assignments',
              label: 'Assignments',
              count: assignments.length,
            },
          ]}
        />
      )}
      {capabilities.unrestricted ? <UnrestrictedAccessNotice /> : null}
      {!capabilities.unrestricted && detailSection === 'permissions' ? (
        <PermissionsSummary options={options} draft={draft} />
      ) : null}
      {detailSection === 'assignments' ? (
        <Assignments
          directory={directory}
          assignments={assignments}
          canAssign={capabilities.canAssign}
          canAssignAudience={canAssignSubjectType(
            capabilities,
            'authenticated',
          )}
          canRevoke={capabilities.canRevoke}
          busy={busy}
          onAssign={onAssign}
          onRevoke={onRevoke}
        />
      ) : null}
    </div>
  );
}

function UnrestrictedAccessNotice(): ReactElement {
  return (
    <NoticeBox title='This permission set grants unrestricted access.'>
      <p>
        Anyone holding it can read and change everything in this application,
        regardless of any other permission set, sharing rule, or restriction
        rule. It has no permissions to configure, so only its assignments are
        managed here.
      </p>
    </NoticeBox>
  );
}

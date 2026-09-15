import { useState, type ReactElement } from 'react';

import type {
  AuthorizationOptions,
  AuthorizationSubject,
  PermissionSetAssignment,
} from '../../authorization-client.js';
import { ConfirmDialog } from '../../components/confirm-dialog.js';
import { ErrorBox, NoticeBox } from '../../components/feedback.js';
import { DetailHeader, DetailTabs } from '../../components/management-ui.js';
import {
  canAssignSubjectType,
  type PermissionSetCapabilities,
} from '../../components/permission-set-access.js';
import { Button } from '../../components/ui/button.js';
import { useAuthorizationTranslation } from '../../i18n.js';
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
  const t = useAuthorizationTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // An unrestricted set has no permissions to configure, so its detail view is the assignments alone.
  const detailSection = capabilities.unrestricted ? 'assignments' : section;
  const title =
    draft.title || humanize(draft.key) || t('permissionSets.detail.untitled');
  return (
    <div className='space-y-5'>
      {error ? <ErrorBox value={error} /> : null}
      <DetailHeader
        onBack={onBack}
        title={title}
        subtitle={detailSummary(
          t,
          draft,
          assignments,
          capabilities.unrestricted,
        )}
        badge={
          <SetBadge tone={detailBadgeTone(capabilities)}>
            {detailBadgeLabel(t, capabilities)}
          </SetBadge>
        }
        actions={
          <>
            {capabilities.canUpdate ? (
              <Button variant='outline' onClick={onEdit}>
                {t('common.edit')}
              </Button>
            ) : null}
            {draft.originalKey && capabilities.canDelete ? (
              <Button
                className='text-destructive hover:text-destructive'
                variant='ghost'
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                {t('common.delete')}
              </Button>
            ) : null}
          </>
        }
      />
      {capabilities.protectedSet && !capabilities.unrestricted ? (
        <NoticeBox>{t('permissionSets.detail.protectedNotice')}</NoticeBox>
      ) : null}
      {capabilities.unrestricted ? null : (
        <DetailTabs
          value={detailSection}
          onChange={(value) => onSection(value as DetailSection)}
          items={[
            {
              value: 'permissions',
              label: t('permissionSets.detail.permissionsTab'),
              count: permissionCountFromDraft(draft),
            },
            {
              value: 'assignments',
              label: t('permissionSets.detail.assignmentsTab'),
              count: assignments.length,
            },
          ]}
        />
      )}
      {capabilities.unrestricted ? <UnrestrictedAccessNotice /> : null}
      {!capabilities.unrestricted && detailSection === 'permissions' ? (
        <PermissionsSummary options={options} draft={draft} />
      ) : null}
      <ConfirmDialog
        busy={busy}
        confirmLabel={t('permissionSets.detail.confirmDelete')}
        open={confirmDelete}
        title={t('permissionSets.detail.confirmDeleteTitle')}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
      >
        {t('permissionSets.detail.confirmDeleteBody', { title })}
      </ConfirmDialog>
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
  const t = useAuthorizationTranslation();
  return (
    <NoticeBox title={t('permissionSets.detail.unrestrictedTitle')}>
      <p>{t('permissionSets.detail.unrestrictedBody')}</p>
    </NoticeBox>
  );
}

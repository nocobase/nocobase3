import { useOutletContext } from 'react-router';
import type { ReactElement } from 'react';
import type { PermissionWorkspaceContext } from './permission-sets/panel.js';
export default function PermissionSetAssignmentsPage(): ReactElement {
  return useOutletContext<PermissionWorkspaceContext>().content;
}

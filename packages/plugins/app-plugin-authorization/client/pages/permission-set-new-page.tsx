import { useOutlet, useOutletContext } from 'react-router';
import type { ReactElement } from 'react';
import type { PermissionWorkspaceContext } from './permission-sets/panel.js';
export default function PermissionSetPage(): ReactElement {
  const outlet = useOutlet();
  const context = useOutletContext<PermissionWorkspaceContext>();
  return outlet ?? context.content;
}

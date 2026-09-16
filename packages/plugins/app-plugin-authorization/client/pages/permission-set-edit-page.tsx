import { useOutlet, useOutletContext } from 'react-router';
import type { ReactElement } from 'react';
import type { PermissionWorkspaceContext } from './permission-sets/panel.js';
export default function PermissionSetPage(): ReactElement {
  const context = useOutletContext<PermissionWorkspaceContext>();
  const outlet = useOutlet(context);
  return outlet ?? context.content;
}

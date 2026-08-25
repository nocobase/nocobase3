import type { AppExtension } from '@nocobase/app-portal-sdk/extensions';
import { defineAppRoutes } from '@nocobase/app-portal-sdk/routing';
import { FolderOpen } from 'lucide-react';

const nocobaseFileUploadExtension: AppExtension = {
  id: 'nocobase-file-upload',
  dev: {
    resources: [
      {
        name: 'file-manager-demo',
        list: 'files',
        meta: {
          label: 'File manager',
          icon: <FolderOpen />,
          description: 'Upload, browse, preview, and download files.',
          acl: { type: 'authenticated' },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: 'development.files',
        path: 'files',
        lazy: () =>
          import('./demo').then((module) => ({
            default: module.FileManagerDemoPage,
          })),
      },
    ]),
  },
};

export default nocobaseFileUploadExtension;

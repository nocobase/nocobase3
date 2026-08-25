import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../client/styles.css';
import {
  FileUploadField,
  type StoredFile,
} from '../client/extensions/nocobase-file-upload';

function FilesUploadPage() {
  const [files, setFiles] = useState<StoredFile[]>([]);

  return (
    <FileUploadField
      basePath='e2e/documents/document-1/file'
      value={files}
      onChange={setFiles}
      accept='.txt'
    />
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Files E2E root is unavailable.');
}

createRoot(root).render(
  <StrictMode>
    <FilesUploadPage />
  </StrictMode>,
);

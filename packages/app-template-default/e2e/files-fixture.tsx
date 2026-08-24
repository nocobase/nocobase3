import { createRoot } from 'react-dom/client';
import { useState } from 'react';

import { FileUploadField } from '../registry/nocobase-file-upload';
import type { StoredFile } from '../registry/nocobase-file-upload';
import '../client/App.css';

const seedFile: StoredFile = {
  id: 'seed-file',
  status: 'ready',
  name: 'seed.png',
  size: 68,
  contentType: 'image/png',
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
};

function FilesFixture() {
  const parameters = new URLSearchParams(window.location.search);
  const [files, setFiles] = useState<StoredFile[]>(
    parameters.get('seed') === '1' ? [seedFile] : [],
  );
  const [progress, setProgress] = useState('');
  const readOnly = parameters.get('readOnly') === '1';

  return (
    <main className='p-8'>
      <FileUploadField
        basePath='business/record/files'
        value={files}
        onChange={setFiles}
        onUploadProgress={(value) => setProgress(String(value.percentage))}
        readOnly={readOnly}
        accept={['.png', '.txt']}
        maxBytes={1024 * 1024}
      />
      <output data-testid='file-ids' hidden>
        {files.map((file) => file.id).join(',')}
      </output>
      <output data-testid='upload-progress' hidden>
        {progress}
      </output>
    </main>
  );
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Files acceptance fixture root is unavailable.');
}
createRoot(container).render(<FilesFixture />);

import { StrictMode, useMemo, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';

import '../client/styles.css';
import { FileUploadField, type StoredFile } from '@nocobase/e2e-file-upload';

function FilesUploadPage() {
  const parameters = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const readOnly = parameters.get('readOnly') === '1';
  const initialFiles = useMemo<StoredFile[]>(() => {
    const id = parameters.get('seedId');
    const name = parameters.get('seedName');
    if (!id || !name) return [];
    return [
      {
        id,
        name,
        status: 'ready',
        size: Number(parameters.get('seedSize') ?? 0),
        contentType: parameters.get('seedContentType'),
        createdAt: '2026-08-27T00:00:00.000Z',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
    ];
  }, [parameters]);
  const [files, setFiles] = useState<StoredFile[]>(initialFiles);
  const [submittedFiles, setSubmittedFiles] = useState<StoredFile[]>([]);
  const [progress, setProgress] = useState(0);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSubmittedFiles(files);
  };

  return (
    <form className='space-y-4' onSubmit={handleSubmit}>
      <FileUploadField
        basePath='e2e/documents/document-1/file'
        value={files}
        onChange={setFiles}
        onUploadProgress={(nextProgress) =>
          setProgress(Math.round(nextProgress.percentage))
        }
        accept='.txt'
        readOnly={readOnly}
        required={!readOnly}
      />
      <output className='block text-sm' data-testid='file-ids'>
        {files.map((file) => file.id).join(',')}
      </output>
      <output className='block text-sm' data-testid='upload-progress'>
        {progress}
      </output>
      {!readOnly ? (
        <button
          className='rounded-md border px-3 py-2 text-sm font-medium'
          type='submit'
        >
          Save
        </button>
      ) : null}
      <output className='block text-sm' data-testid='submit-result'>
        {submittedFiles.length
          ? `Saved ${submittedFiles.length} file`
          : 'Not saved'}
      </output>
    </form>
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

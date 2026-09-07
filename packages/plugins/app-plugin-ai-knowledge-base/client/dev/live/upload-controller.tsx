import { useNotification } from '@refinedev/core';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '../../components/ui/alert.js';
import { LoadingState } from '../../components/app-shell-loading-state.js';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '../../components/ui/empty.js';
import { FileUp } from 'lucide-react';
import {
  UploadDocumentDialog,
  defaultDocumentExtensions,
} from '../../components/index.js';
import {
  useKnowledgeBase,
  useKnowledgeBaseDocument,
} from '../../hooks/index.js';
import {
  canMaintainKnowledgeBaseDocuments,
  isAsyncUploadResult,
} from '../../providers/index.js';
import { knowledgeBaseLiveRoutes } from '../knowledge-base-routes.js';
import { notifyKnowledgeBaseMutationError } from './notifications.js';
import { liveReturnTo } from './url-state.js';
import { useT } from '../../locales/index.js';

export default function UploadController() {
  const { open: notify } = useNotification();
  const t = useT();
  const { knowledgeBaseKey } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const knowledgeBase = useKnowledgeBase({ knowledgeBaseKey });
  const [file, setFile] = useState<File>();
  const [encodings, setEncodings] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const isZip = file?.name.toLowerCase().endsWith('.zip') ?? false;
  const base = knowledgeBase.knowledgeBase;
  const documentState = useKnowledgeBaseDocument({
    knowledgeBaseKey: base.data?.key ?? knowledgeBaseKey,
    upload: {
      enabled: !!(base.data?.key ?? knowledgeBaseKey),
      includeConstraints: true,
      includeZipEncodingOptions: isZip,
    },
  });
  const { service } = documentState;
  const constraints = documentState.upload.constraints;
  const encodingOptions = documentState.upload.zipEncodingOptions;

  const fallback = knowledgeBaseKey
    ? `${knowledgeBaseLiveRoutes.workspace(knowledgeBaseKey)}${location.search}${location.hash}`
    : knowledgeBaseLiveRoutes.list;
  const closeTo = knowledgeBaseKey
    ? liveReturnTo(
        location.state,
        fallback,
        knowledgeBaseLiveRoutes.workspace(knowledgeBaseKey),
      )
    : fallback;

  if (base.loading && !base.data) {
    return (
      <main className='p-4 md:p-7'>
        <LoadingState className='min-h-64' />
      </main>
    );
  }
  if (base.error || !base.data) {
    return (
      <main className='p-4 md:p-7'>
        <Empty className='min-h-64 border'>
          <EmptyHeader>
            <EmptyDescription>
              {t('Knowledge base unavailable or not authorized.')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }
  const activeBase = base.data;
  if (!canMaintainKnowledgeBaseDocuments(activeBase)) {
    return (
      <main className='p-4 md:p-7'>
        <Empty className='min-h-64 border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FileUp aria-hidden='true' />
            </EmptyMedia>
            <EmptyDescription>
              {t('Uploading documents is unavailable for this knowledge base.')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  const submit = async () => {
    if (!file || submitting) return;
    if (constraints.loading) {
      setError(t('Loading upload requirements. Try again in a moment.'));
      return;
    }
    if (constraints.error || !constraints.data) {
      setError(
        t(
          'Upload requirements are unavailable. The document was not submitted.',
        ),
      );
      return;
    }
    if (
      constraints.data.maxFileSizeBytes &&
      file.size > constraints.data.maxFileSizeBytes
    ) {
      setError(t('This file exceeds the server upload limit.'));
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      const result = await service.uploadDocument({
        knowledgeBaseKey: activeBase.key,
        file,
        ...(isZip && encodings.length
          ? { zipFilenameEncodings: encodings }
          : {}),
      });
      const uploadNotice = isAsyncUploadResult(result)
        ? result.message ||
          t('The upload task was submitted. Indexing may take a few moments.')
        : t('The document was uploaded. Refreshing the document list.');
      notify?.({
        type: 'success',
        message: t('Upload submitted'),
        description: uploadNotice,
      });
      navigate(closeTo);
    } catch (nextError) {
      const message = t('Upload failed');
      notifyKnowledgeBaseMutationError(notify, message, nextError, message);
    } finally {
      setSubmitting(false);
    }
  };

  const allowedExtensions = constraints.data?.acceptedExtensions?.length
    ? constraints.data.acceptedExtensions
    : defaultDocumentExtensions;
  const defaultZipFilenameEncoding = encodingOptions.data?.find(
    (option) => option.isDefault,
  )?.value;
  const dialogError =
    error ||
    (constraints.error
      ? t(
          'Upload requirements are unavailable. The document was not submitted.',
        )
      : undefined);

  return (
    <>
      {encodingOptions.error && isZip ? (
        <div className='px-4 pt-4 md:px-7'>
          <Alert>
            <AlertTitle>{t('ZIP encoding options unavailable')}</AlertTitle>
            <AlertDescription>
              {t(
                'Leave the encoding selection empty or ask the Portal administrator to expose a supported server capability.',
              )}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      <UploadDocumentDialog
        open
        onOpenChange={(open) => {
          if (!open) navigate(closeTo);
        }}
        file={file}
        onFileChange={(next) => {
          setFile(next);
          setEncodings([]);
          setError(undefined);
        }}
        zipFilenameEncodings={encodings}
        encodingOptions={encodingOptions.data ?? []}
        defaultZipFilenameEncoding={defaultZipFilenameEncoding}
        onZipFilenameEncodingsChange={(values) =>
          setEncodings(
            Array.from(
              new Set(values.map((value) => value.trim()).filter(Boolean)),
            ),
          )
        }
        onSubmit={() => void submit()}
        submitting={submitting}
        error={dialogError}
        allowedExtensions={allowedExtensions}
        maxFileSizeBytes={constraints.data?.maxFileSizeBytes}
        onFileRejected={(message) => setError(message || undefined)}
      />
    </>
  );
}

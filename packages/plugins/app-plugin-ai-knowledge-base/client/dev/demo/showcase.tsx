import { useMemo, useState, type ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Card, CardContent } from '../../components/ui/card.js';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover.js';
import { Switch } from '../../components/ui/switch.js';
import {
  DocumentTable,
  KnowledgeBaseHitTests,
  KnowledgeBaseSwitchableDirectory,
  SegmentEditor,
  SegmentTable,
  UploadDocumentDialog,
  UploadDocumentForm,
} from '../../components/index.js';
import {
  fixtureDocuments,
  fixtureKnowledgeBaseDirectory,
  fixtureRetrievalResults,
  fixtureSegments,
  fixtureZipFilenameEncodingResponse,
} from './fixtures/data.js';
import { useT } from '../../locales/index.js';

const ignoreDemoAction = () => undefined;

type SegmentDraft = {
  title?: string;
  content: string;
  questions: NonNullable<(typeof fixtureSegments)[number]['questions']>;
};

function createSegmentDraft(
  segment: (typeof fixtureSegments)[number],
): SegmentDraft {
  return {
    title: segment.title,
    content: segment.content ?? '',
    questions: segment.questions ?? [],
  };
}

function DemoPage({
  title,
  description,
  components,
  children,
}: {
  title: string;
  description: string;
  components: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <main className='space-y-8 px-4 pb-12 pt-4 sm:px-6 sm:pt-6 lg:px-8'>
      <section className='flex flex-wrap items-start justify-between gap-5'>
        <div>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='secondary'>{t('Knowledge base components')}</Badge>
            <Badge variant='outline'>{components}</Badge>
          </div>
          <h1 className='mt-4 text-3xl font-semibold tracking-[-0.035em]'>
            {title}
          </h1>
          <p className='mt-3 max-w-3xl text-sm leading-6 text-muted-foreground'>
            {description}
          </p>
        </div>
      </section>
      {children}
    </main>
  );
}

export function DirectoryPage() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const items = useMemo(
    () =>
      fixtureKnowledgeBaseDirectory.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  return (
    <DemoPage
      title={t('Knowledge bases')}
      components={t('Knowledge base entrance')}
      description={t(
        'Browse knowledge bases available to a workspace, switch between layouts, and search by name.',
      )}
    >
      <KnowledgeBaseSwitchableDirectory
        items={items}
        query={query}
        onQueryChange={setQuery}
        view={view}
        onViewChange={setView}
        onItemOpen={ignoreDemoAction}
      />
    </DemoPage>
  );
}

export function DocumentsPage() {
  const t = useT();

  return (
    <DemoPage
      title={t('Documents')}
      components={t('Document management')}
      description={t(
        'Review source documents for a knowledge base and use the available table actions to inspect, download, re-index, or remove permitted content.',
      )}
    >
      <DocumentTable
        documents={fixtureDocuments.slice(0, 8)}
        canMaintain={(document) => document.accessAbility === 'readWrite'}
        onOpen={ignoreDemoAction}
        onDownload={ignoreDemoAction}
        onVectorize={ignoreDemoAction}
        onDelete={ignoreDemoAction}
      />
    </DemoPage>
  );
}

export function SegmentsPage() {
  const t = useT();
  const [segments, setSegments] = useState(() => fixtureSegments.slice(0, 8));
  const [activeSegment, setActiveSegment] = useState<
    (typeof fixtureSegments)[number]
  >(segments[0]);
  const [draft, setDraft] = useState<SegmentDraft>(() =>
    createSegmentDraft(segments[0]),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [segmentSettings, setSegmentSettings] = useState({
    splitDocument: true,
    chunkSize: 6000,
    chunkOverlap: 1200,
  });
  const [settingsDraft, setSettingsDraft] = useState(segmentSettings);

  const selectSegment = (segment: (typeof fixtureSegments)[number]) => {
    setActiveSegment(segment);
    setDraft(createSegmentDraft(segment));
  };

  const handleDelete = (segment: (typeof fixtureSegments)[number]) => {
    const remaining = segments.filter((item) => item.uid !== segment.uid);
    setSegments(remaining);
    if (activeSegment.uid === segment.uid && remaining[0])
      selectSegment(remaining[0]);
  };

  return (
    <DemoPage
      title={t('Segments')}
      components={t('Segment management')}
      description={t(
        'Review the segments generated from a document and edit their content or related questions.',
      )}
    >
      <div className='space-y-3'>
        <div className='flex justify-end'>
          <Popover
            open={settingsOpen}
            onOpenChange={(nextOpen) => {
              if (nextOpen) setSettingsDraft(segmentSettings);
              setSettingsOpen(nextOpen);
            }}
          >
            <PopoverTrigger
              render={
                <Button variant='outline' size='sm'>
                  <Settings2 aria-hidden='true' />
                  {t('Segment settings')}
                </Button>
              }
            />
            <PopoverContent align='end' className='w-80 p-4'>
              <form
                className='grid gap-3'
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  setSegmentSettings(settingsDraft);
                  setSettingsOpen(false);
                }}
              >
                <label className='flex items-center justify-between gap-3 text-sm font-medium'>
                  {t('Split document')}
                  <Switch
                    checked={settingsDraft.splitDocument}
                    onCheckedChange={(splitDocument) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        splitDocument,
                      }))
                    }
                    aria-label={t('Split document')}
                  />
                </label>
                <label className='grid gap-1.5 text-sm font-medium'>
                  {t('Chunk size')}
                  <Input
                    type='number'
                    min={1}
                    step='any'
                    value={settingsDraft.chunkSize}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        chunkSize: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1.5 text-sm font-medium'>
                  {t('Chunk overlap')}
                  <Input
                    type='number'
                    min={0}
                    step='any'
                    value={settingsDraft.chunkOverlap}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        chunkOverlap: Math.max(
                          0,
                          Number(event.target.value) || 0,
                        ),
                      }))
                    }
                  />
                </label>
                <div className='flex justify-end gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setSettingsOpen(false)}
                  >
                    {t('Cancel')}
                  </Button>
                  <Button type='submit' size='sm'>
                    {t('Regenerate')}
                  </Button>
                </div>
              </form>
            </PopoverContent>
          </Popover>
        </div>
        <Card className='bg-card'>
          <CardContent className='px-0'>
            <SegmentTable
              segments={segments}
              canMaintain
              onOpen={selectSegment}
              onToggleEnabled={(segment, enabled) => {
                setSegments((current) =>
                  current.map((item) =>
                    item.uid === segment.uid ? { ...item, enabled } : item,
                  ),
                );
                if (activeSegment.uid === segment.uid)
                  setActiveSegment({ ...activeSegment, enabled });
              }}
              onDelete={handleDelete}
            />
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby='demo-segment-editor' className='space-y-4 pt-2'>
        <div className='space-y-1.5'>
          <h2
            id='demo-segment-editor'
            className='font-heading text-lg font-semibold'
          >
            {t('Segment editor')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t(
              "Edit this segment's content and related questions. Save changes to keep the current segment up to date.",
            )}
          </p>
        </div>
        <Card className='bg-card'>
          <CardContent>
            <SegmentEditor
              segment={activeSegment}
              draft={draft}
              onDraftChange={setDraft}
              onSave={() => {
                setSegments((current) =>
                  current.map((item) =>
                    item.uid === activeSegment.uid
                      ? {
                          ...item,
                          content: draft.content,
                          questionCount: draft.questions.length,
                          questions: draft.questions,
                        }
                      : item,
                  ),
                );
              }}
            />
          </CardContent>
        </Card>
      </section>
    </DemoPage>
  );
}

export function HitTestsPage() {
  const t = useT();
  const [queryDraft, setQueryDraft] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState<string>();
  const [settings, setSettings] = useState({ topK: 4, score: 0.6 });
  const [results, setResults] = useState<typeof fixtureRetrievalResults>([]);

  return (
    <DemoPage
      title={t('Hit tests')}
      components={t('Document retrieval')}
      description={t(
        'Evaluate how a query matches knowledge-base content by tuning retrieval settings and reviewing ranked results.',
      )}
    >
      <KnowledgeBaseHitTests
        queryDraft={queryDraft}
        submittedQuery={submittedQuery}
        settings={settings}
        results={results}
        onQueryChange={setQueryDraft}
        onSubmit={(query) => {
          setSubmittedQuery(query);
          setResults(fixtureRetrievalResults.slice(0, settings.topK));
        }}
        onEditQuery={() => {
          setSubmittedQuery(undefined);
          setResults([]);
        }}
        onSettingsChange={setSettings}
        onRetry={() =>
          setResults(fixtureRetrievalResults.slice(0, settings.topK))
        }
        onOpenResult={ignoreDemoAction}
      />
    </DemoPage>
  );
}

export function UploadPage() {
  const t = useT();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogFile, setDialogFile] = useState<File>();
  const [dialogEncodings, setDialogEncodings] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | undefined>(
    () =>
      new File(['Selected document'], 'employee-handbook.pdf', {
        type: 'application/pdf',
      }),
  );
  const [selectedZipFile, setSelectedZipFile] = useState<File | undefined>(
    () =>
      new File(['Selected ZIP archive'], 'product-archive.zip', {
        type: 'application/zip',
      }),
  );
  const [selectedZipEncodings, setSelectedZipEncodings] = useState<string[]>(
    [],
  );

  return (
    <DemoPage
      title={t('Document upload')}
      components={t('Upload panel')}
      description={t(
        'Open the upload dialog or review selected-file states before adding source documents, including filename encoding choices for ZIP archives.',
      )}
    >
      <Button onClick={() => setDialogOpen(true)}>
        {t('Open upload dialog')}
      </Button>
      <UploadDocumentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={t('Upload a document')}
        file={dialogFile}
        onFileChange={setDialogFile}
        zipFilenameEncodings={dialogEncodings}
        encodingOptions={fixtureZipFilenameEncodingResponse.options}
        defaultZipFilenameEncoding={
          fixtureZipFilenameEncodingResponse.defaultEncoding
        }
        onZipFilenameEncodingsChange={setDialogEncodings}
        onSubmit={ignoreDemoAction}
      />
      <div className='grid gap-6 lg:grid-cols-2'>
        <section className='space-y-3' aria-labelledby='demo-upload-file'>
          <div className='space-y-1.5'>
            <h2
              id='demo-upload-file'
              className='font-heading text-lg font-semibold'
            >
              {t('File selected')}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t(
                'Review a selected source file and its details before upload.',
              )}
            </p>
          </div>
          <Card className='bg-card'>
            <CardContent>
              <UploadDocumentForm
                file={selectedFile}
                onFileChange={setSelectedFile}
                zipFilenameEncodings={[]}
                encodingOptions={fixtureZipFilenameEncodingResponse.options}
                onZipFilenameEncodingsChange={ignoreDemoAction}
                onSubmit={ignoreDemoAction}
                showSubmitButton={false}
              />
            </CardContent>
          </Card>
        </section>
        <section className='space-y-3' aria-labelledby='demo-upload-zip'>
          <div className='space-y-1.5'>
            <h2
              id='demo-upload-zip'
              className='font-heading text-lg font-semibold'
            >
              {t('ZIP file selected')}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t(
                'Choose filename encodings for a selected ZIP archive before upload.',
              )}
            </p>
          </div>
          <Card className='bg-card'>
            <CardContent>
              <UploadDocumentForm
                file={selectedZipFile}
                onFileChange={setSelectedZipFile}
                zipFilenameEncodings={selectedZipEncodings}
                encodingOptions={fixtureZipFilenameEncodingResponse.options}
                defaultZipFilenameEncoding={
                  fixtureZipFilenameEncodingResponse.defaultEncoding
                }
                onZipFilenameEncodingsChange={setSelectedZipEncodings}
                onSubmit={ignoreDemoAction}
                showSubmitButton={false}
              />
            </CardContent>
          </Card>
        </section>
      </div>
    </DemoPage>
  );
}

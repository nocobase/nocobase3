import type {
  KnowledgeBase,
  KnowledgeBaseDocument,
  KnowledgeBaseSearchResult,
  KnowledgeBaseSegment,
  ZipFilenameEncodingOption,
} from '../../../providers/index.js';

export const fixtureKnowledgeBases: KnowledgeBase[] = Array.from(
  { length: 24 },
  (_, index) => ({
    id: index + 1,
    key: `library-${String(index + 1).padStart(2, '0')}`,
    name:
      ['Team Handbook', 'Product Archive', 'Customer Research'][index % 3] +
      ` ${index + 1}`,
    description:
      index % 5 === 0
        ? undefined
        : `A deterministic fixture with a ${index % 2 ? 'concise' : 'longer descriptive'} summary for layout validation.`,
    knowledgeBaseType:
      index % 8 === 0 ? 'EXTERNAL' : index % 6 === 0 ? 'READONLY' : 'LOCAL',
    documentCount: (index + 1) * 3,
    characterCount: (index + 1) * 1280,
    aiEmployeeCount: index % 4,
    enabled: index % 7 !== 0,
    createdAt: `2026-0${(index % 8) + 1}-0${(index % 9) + 1}T10:00:00.000Z`,
    updatedAt: `2026-0${(index % 8) + 1}-1${index % 9}T10:00:00.000Z`,
  }),
);
export const fixtureKnowledgeBaseDirectory = [
  fixtureKnowledgeBases[1],
  fixtureKnowledgeBases[2],
  fixtureKnowledgeBases[3],
  fixtureKnowledgeBases[4],
  fixtureKnowledgeBases[0],
  fixtureKnowledgeBases[6],
];
export const fixtureZipFilenameEncodingResponse = {
  defaultEncoding: 'windows-1252',
  options: [
    {
      value: 'utf-8',
      label: 'utf-8',
      description: 'Unicode (UTF-8)',
      isDefault: false,
    },
    {
      value: 'windows-1252',
      label: 'windows-1252',
      description: 'Western European',
      isDefault: true,
    },
    {
      value: 'gb18030',
      label: 'gb18030',
      description: 'Simplified Chinese',
      isDefault: false,
    },
    {
      value: 'gbk',
      label: 'gbk',
      description: 'Simplified Chinese (GBK)',
      isDefault: false,
    },
    {
      value: 'big5',
      label: 'big5',
      description: 'Traditional Chinese',
      isDefault: false,
    },
    {
      value: 'shift_jis',
      label: 'shift_jis',
      description: 'Japanese',
      isDefault: false,
    },
    {
      value: 'euc-kr',
      label: 'euc-kr',
      description: 'Korean',
      isDefault: false,
    },
    {
      value: 'windows-1251',
      label: 'windows-1251',
      description: 'Cyrillic',
      isDefault: false,
    },
  ] satisfies ZipFilenameEncodingOption[],
} as const;
export const fixtureDocuments: KnowledgeBaseDocument[] = Array.from(
  { length: 37 },
  (_, index) => ({
    id: index + 1,
    knowledgeBaseKey: 'library-01',
    title: index % 4 === 0 ? undefined : `Knowledge document ${index + 1}`,
    filename: `source-${index + 1}.${index % 5 === 0 ? 'zip' : 'pdf'}`,
    characterCount: 1200 + index * 217,
    segmentCount: 1 + (index % 9),
    size: 2048 + index * 1000,
    indexStatus: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'][index % 4],
    errorMessage:
      index % 4 === 3 ? 'Indexing failed in the fixture state.' : undefined,
    accessAbility: index % 3 === 0 ? 'readWrite' : 'readOnly',
    createdById: index % 3 === 0 ? 'me' : 'teammate',
    createdAt: `2026-07-${String((index % 27) + 1).padStart(2, '0')}T08:30:00.000Z`,
    updatedAt: `2026-07-${String((index % 27) + 1).padStart(2, '0')}T10:00:00.000Z`,
  }),
);
export const fixtureRetrievalResults: KnowledgeBaseSearchResult[] = Array.from(
  { length: 12 },
  (_, index) => ({
    id: index + 1,
    title: `Relevant passage ${index + 1}`,
    filename: `source-${(index % 4) + 1}.pdf`,
    content: `This is deterministic retrieval passage ${index + 1}. It intentionally has enough text to inspect card, ranked, grouped, and split-view layouts without an API request.`,
    score: Number((0.94 - index * 0.03).toFixed(2)),
    matchedQuestions:
      index % 2 ? [`What does fixture ${index + 1} cover?`] : [],
  }),
);
export const fixtureSegments: KnowledgeBaseSegment[] = Array.from(
  { length: 42 },
  (_, index) => ({
    uid: `segment-${index + 1}`,
    position: index + 1,
    title: index % 3 ? `Segment ${index + 1}` : undefined,
    preview: `Deterministic preview for segment ${index + 1}.`,
    content: `Deterministic full content for segment ${index + 1}.`,
    charLength: 280 + index * 19,
    questionCount: index % 5,
    enabled: index % 7 !== 0,
    contentHash: `hash-${index + 1}`,
    updatedAt: `2026-07-${String((index % 27) + 1).padStart(2, '0')}T${String(9 + (index % 8)).padStart(2, '0')}:15:00.000Z`,
    questions: [{ content: `Question for segment ${index + 1}` }],
  }),
);

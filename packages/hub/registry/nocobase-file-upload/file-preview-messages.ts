import type { FilePreviewMessages } from './types';

export const defaultFilePreviewMessages: FilePreviewMessages = {
  preview: 'Preview',
  download: 'Download',
  previous: 'Previous file',
  next: 'Next file',
  close: 'Close',
  noFiles: 'No files',
  loading: 'Loading file...',
  loadError: 'Unable to load file',
  unsupportedTitle: 'Preview is not available',
  unsupportedDescription:
    'This file format is not supported for preview. Download the file to view it.',
  imageAlt: (filename) => `Preview of ${filename}`,
  pdfTitle: 'PDF preview',
  textTitle: 'File preview',
  audioTitle: 'Audio preview',
  videoTitle: 'Video preview',
  officeTitle: 'Office document',
  officeError: 'Office documents are download-only in Files V1.',
};

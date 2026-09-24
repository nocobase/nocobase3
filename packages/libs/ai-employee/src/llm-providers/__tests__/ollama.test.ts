import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { OllamaProvider } from '../ollama.js';

describe('Ollama attachments', () => {
  const parse = (filename: string, mimetype: string) =>
    new OllamaProvider({ serviceOptions: {} }).parseAttachment(
      {
        id: 1,
        title: filename,
        filename,
        mimetype,
        path: `ai-files/1-${filename}`,
        disk: 'local',
      } as never,
      {
        fileStorage: {
          openMetadata: async () => ({
            stream: Readable.from([Buffer.from('hello')]),
          }),
        } as never,
        documentLoader: {
          load: async () => ({ supported: true, text: 'extracted' }),
        },
        getHeader: () => '',
      },
    );

  it('sends an image to the model as a content block', async () => {
    await expect(parse('chart.png', 'image/png')).resolves.toMatchObject({
      placement: 'contentBlocks',
      content: { image_url: { url: 'data:image/png;base64,aGVsbG8=' } },
    });
  });

  it('keeps a PDF on the loader, since the Ollama client rejects a file block', async () => {
    const parsed = (await parse('report.pdf', 'application/pdf')) as {
      placement: string;
      content: unknown;
    };
    expect(parsed.placement).not.toBe('contentBlocks');
  });
});

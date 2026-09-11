import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  clientFileRepositoryManagerToken,
  type ClientFileRepositoryManager,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';
import fileRepository from '../client/index.js';

const state = vi.hoisted(() => ({
  manager: undefined as ClientFileRepositoryManager | undefined,
}));
vi.mock('@nocobase/app-client', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@nocobase/app-client')>();
  return {
    ...original,
    useService: (token: unknown) => {
      expect(token).toBe(clientFileRepositoryManagerToken);
      return state.manager;
    },
  };
});
vi.mock('@nocobase/i18n/client', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@nocobase/i18n/client')>();
  return {
    ...original,
    useTranslation: (namespace: string) => {
      expect(namespace).toBe('@nocobase/app-plugin-file-example');
      return { t: (key: string) => key };
    },
  };
});

describe('File Repository example page', () => {
  it('loads the public dev route, uploads selected files and follows server content URLs', async () => {
    const records: FileRecord[] = [];
    const create = (file: File): FileRecord => ({
      id: `id-${records.length}`,
      disk: 'local',
      key: file.name,
      filename: file.name,
      ext: 'txt',
      mimeType: 'text/plain',
      size: file.size,
      createdAt: '2026-09-07T00:00:00',
      updatedAt: '2026-09-07T00:00:00',
      contentUrl: `/main/uploads/attachments/${file.name}`,
    });
    const repository = {
      findMany: vi.fn(() => Promise.resolve([...records])),
      uploadOne: vi.fn(({ file }: { file: File }) => {
        records.push(create(file));
        return Promise.resolve();
      }),
      uploadMany: vi.fn(({ files }: { files: File[] }) => {
        files.forEach((file) => records.push(create(file)));
        return Promise.resolve();
      }),
      deleteOne: vi.fn(({ filter }: { filter: { id: string } }) => {
        records.splice(
          records.findIndex((record) => record.id === filter.id),
          1,
        );
        return Promise.resolve();
      }),
    };
    const getRepository = vi.fn(() => repository);
    state.manager = {
      repository: getRepository,
    } as unknown as ClientFileRepositoryManager;
    const contribution = fileRepository().routes.find(
      (route) => route.parent === 'dev',
    );
    const route = contribution?.routes.find(
      (entry) => entry.name === 'file-repository',
    );
    expect(route?.path).toBe('/file-repository');
    if (!route || !('componentLoader' in route))
      throw new Error('Missing example route');
    const { default: Page } = await route.componentLoader();
    const user = userEvent.setup();
    render(<Page />);
    await screen.findByText('empty');
    expect(getRepository).toHaveBeenCalledWith('attachments');
    expect(screen.getByRole('button', { name: 'single' })).toBeDisabled();
    const first = new File(['one'], 'one.txt', { type: 'text/plain' });
    const second = new File(['two'], 'two.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('choose'), {
      target: { files: [first] },
    });
    await user.click(screen.getByRole('button', { name: 'single' }));
    await screen.findByText('one.txt');
    expect(repository.uploadOne).toHaveBeenCalledWith({ file: first });
    expect(screen.getByRole('link', { name: 'open' })).toHaveAttribute(
      'href',
      '/main/uploads/attachments/one.txt',
    );
    fireEvent.change(screen.getByLabelText('choose'), {
      target: { files: [second, first] },
    });
    expect(screen.getByRole('button', { name: 'single' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'multiple' }));
    await screen.findByText('two.txt');
    expect(repository.uploadMany).toHaveBeenCalledWith({
      files: [second, first],
    });
    await user.click(screen.getAllByRole('button', { name: 'remove' })[0]!);
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'open' })).toHaveLength(2),
    );
    expect(repository.deleteOne).toHaveBeenCalledWith({
      filter: { id: 'id-0' },
    });
  });
});

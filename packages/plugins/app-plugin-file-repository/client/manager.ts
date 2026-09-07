import type { ApiClient, RemoteRepository } from '@nocobase/api-client';
import type {
  FileRecord,
  UploadOneInput,
  UploadManyInput,
  UploadOneResult,
  UploadManyResult,
} from '../shared/types.js';

export type ClientFileRepository = RemoteRepository<FileRecord> & {
  uploadOne(input: UploadOneInput): Promise<UploadOneResult>;
  uploadMany(input: UploadManyInput): Promise<UploadManyResult>;
};
export class ClientFileRepositoryManager {
  constructor(private readonly api: ApiClient) {}
  repository(name: string): ClientFileRepository {
    const api = this.api;
    const repository = api.repository<FileRecord>(name);
    return Object.assign(repository, {
      async uploadOne({ file }: UploadOneInput): Promise<UploadOneResult> {
        const body = new FormData();
        body.append('file', file);
        const { data } = await api.request<{ data: UploadOneResult }>({
          path: `/${encodeURIComponent(name)}:uploadOne`,
          method: 'POST',
          body,
        });
        return data;
      },
      async uploadMany({ files }: UploadManyInput): Promise<UploadManyResult> {
        const body = new FormData();
        for (const file of files) body.append('file', file);
        const { data } = await api.request<{ data: UploadManyResult }>({
          path: `/${encodeURIComponent(name)}:uploadMany`,
          method: 'POST',
          body,
        });
        return data;
      },
    });
  }
}

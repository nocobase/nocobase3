import {
  RepositoryError,
  type DatabaseManager,
  type FilterBuilder,
  type Row,
} from '@nocobase/db';

interface ArticleInput {
  title: string;
  summary: string;
  content: string;
  status: string;
}

const PAGE_SIZE = 12;

export class ArticlesService {
  constructor(private readonly database: DatabaseManager) {}

  async list(options: {
    page: number;
    search: string;
    status?: string;
  }): Promise<{ data: Row[]; total: number; page: number }> {
    const { page, search, status } = options;
    const repository = this.database.repository('articles');
    const filter =
      search || status
        ? {
            filter: (f: FilterBuilder) =>
              f.and([
                ...(search ? [f.string('title').includes(search)] : []),
                ...(status ? [f.string('status').eq(status)] : []),
              ]),
          }
        : {};
    const [total, data] = await Promise.all([
      repository.count(filter),
      repository.findMany({
        ...filter,
        sort: (sort) => [
          sort.field('updatedAt').desc(),
          sort.field('id').desc(),
        ],
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    ]);
    return { data: data.map(serializeArticle), total, page };
  }

  async create(input: ArticleInput): Promise<void> {
    const now = new Date();
    await this.database.repository('articles').createOne({
      values: {
        ...input,
        publishedAt: input.status === 'published' ? now : null,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  async update(id: number, input: ArticleInput): Promise<boolean> {
    const repository = this.database.repository('articles');
    const current = await repository.findOne({ filter: { id } });
    if (!current) return false;
    const now = new Date();
    const published = current.publishedAt ?? null;
    try {
      await repository.updateOne({
        filter: { id },
        values: {
          ...input,
          updatedAt: now,
          publishedAt:
            input.status === 'published' ? (published ?? now) : published,
        },
      });
    } catch (error) {
      // The record may have been deleted after it was read.
      if (
        error instanceof RepositoryError &&
        error.code === 'RECORD_NOT_FOUND'
      ) {
        return false;
      }
      throw error;
    }
    return true;
  }
}

function serializeArticle(row: Row): Row {
  const result = { ...row };
  for (const field of ['createdAt', 'updatedAt', 'publishedAt']) {
    if (!(field in result) || result[field] == null) continue;
    const value = result[field];
    if (
      !(value instanceof Date) &&
      typeof value !== 'string' &&
      typeof value !== 'number'
    ) {
      result[field] = null;
      continue;
    }
    // SQLite can return a millisecond timestamp as a numeric string; other drivers return Date/ISO strings.
    const date =
      value instanceof Date
        ? value
        : new Date(
            typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))
              ? Number(value)
              : String(value),
          );
    result[field] = Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return result;
}

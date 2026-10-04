import { z } from 'zod';

export const articleStatuses = ['draft', 'published', 'archived'] as const;

export const ArticleParams = z.object({
  // The column is an auto-increment integer; the API exchanges it as a string.
  articleId: z.string().regex(/^[1-9]\d{0,15}$/, 'Expected an article id.'),
});

export const ListArticlesQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(255).default(''),
  status: z.enum(articleStatuses).optional(),
});
export type ListArticlesQuery = z.infer<typeof ListArticlesQuery>;

const title = z.string().trim().min(1).max(255);
const summary = z.string().trim().max(2000);
const content = z.string().max(100000);
const status = z.enum(articleStatuses);

export const CreateArticleInput = z.strictObject({
  title,
  summary,
  content,
  status,
});
export type CreateArticleInput = z.infer<typeof CreateArticleInput>;

export const UpdateArticleInput = z.strictObject({
  title: title.optional(),
  summary: summary.optional(),
  content: content.optional(),
  status: status.optional(),
});
export type UpdateArticleInput = z.infer<typeof UpdateArticleInput>;

export const NumericExamplesQuery = z.object({
  source: z.enum(['query', 'repository']).default('query'),
  sample: z.enum(['all', 'null', 'empty']).default('all'),
  sortField: z
    .enum([
      'id',
      'integerValue',
      'bigintValue',
      'decimalValue',
      'floatValue',
      'doubleValue',
    ])
    .default('id'),
  sortDirection: z.enum(['asc', 'desc']).default('asc'),
});
export type NumericExamplesQuery = z.infer<typeof NumericExamplesQuery>;

import type {
  DatabaseAuthorizationConditions,
  DatabaseFilter,
  DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';
import type {
  DatabaseManager,
  ComparisonOperator,
  Expression,
  ExpressionBuilder,
  SqlBool,
  Row,
} from '@nocobase/db';

interface ArticleInput {
  title: string;
  summary: string;
  content: string;
  status: string;
}
const fields = [
  'id',
  'title',
  'summary',
  'content',
  'status',
  'publishedAt',
  'createdAt',
  'updatedAt',
];

export class ArticlesService {
  constructor(private readonly database: DatabaseManager) {}

  async list(
    options: { page: number; search: string; status?: string },
    allowed: string[],
    conditions: DatabaseAuthorizationConditions,
  ): Promise<{ data: Row[]; total: number; page: number }> {
    const { page, search, status } = options;
    let query = this.database
      .query()
      .selectFrom('articles')
      .where((eb) => compileFilter(eb, conditions.filter));
    if (search) query = query.where('title', 'like', `%${search}%`);
    if (status) query = query.where('status', '=', status);
    const count = await query
      .select((eb) => [eb.fn.countAll().as('total')])
      .executeTakeFirst();
    const data = await query
      .select(allowed)
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')
      .limit(12)
      .offset((page - 1) * 12)
      .execute();
    return {
      data: data.map(serializeArticle),
      total: Number(count?.total ?? 0),
      page,
    };
  }

  async create(input: ArticleInput): Promise<void> {
    const now = new Date();
    await this.database
      .query()
      .insertInto('articles')
      .values({
        ...input,
        publishedAt: input.status === 'published' ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  async update(
    id: number,
    input: ArticleInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<boolean> {
    const now = new Date();
    const current = await this.database
      .query()
      .selectFrom('articles')
      .select('publishedAt')
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .executeTakeFirst();
    if (!current) return false;
    const result = await this.database
      .query()
      .updateTable('articles')
      .set({
        ...input,
        updatedAt: now,
        publishedAt:
          input.status === 'published'
            ? (current.publishedAt ?? now)
            : current.publishedAt,
      })
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return Boolean(result.updatedCount);
  }
}

const operators: Record<DatabaseFilterOperator, ComparisonOperator> = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $notIn: 'not in',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

function compileFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  return eb.and(
    Object.entries(filter).map(([field, value]) => {
      if (field === '$and' || field === '$or') {
        if (!Array.isArray(value))
          throw new Error('Invalid authorization filter.');
        const nested = (value as readonly DatabaseFilter[]).map((item) =>
          compileFilter(eb, item),
        );
        return field === '$and' ? eb.and(nested) : eb.or(nested);
      }
      if (!value || Array.isArray(value) || !fields.includes(field))
        throw new Error('Invalid authorization field.');
      return eb.and(
        Object.entries(value).map(([operator, expected]) => {
          const comparison = operators[operator as DatabaseFilterOperator];
          if (!comparison) throw new Error('Unsupported authorization filter.');
          return eb(
            field,
            expected === null && operator === '$eq'
              ? 'is'
              : expected === null && operator === '$ne'
                ? 'is not'
                : comparison,
            expected,
          );
        }),
      );
    }),
  );
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

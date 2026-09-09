import type {
  FilterAst,
  SelectAst,
  SelectIncludeNode,
  SortAst,
} from '../../../../src/index.js';
import { type IntegrationTestContext } from '../../helpers.js';

export async function createRelationFixture(
  context: IntegrationTestContext,
): Promise<void> {
  await context.builder.createCollections([
    {
      name: 'repositoryAuthors',
      definition: (collection) => {
        collection.increments('id');
        collection.string('name').notNull();
        collection
          .hasOne('profile', 'repositoryProfiles')
          .sourceKey('id')
          .foreignKey('authorId');
        collection
          .hasMany('books', 'repositoryBooks')
          .sourceKey('id')
          .foreignKey('authorId');
      },
    },
    {
      name: 'repositoryProfiles',
      definition: (collection) => {
        collection.increments('id');
        collection.integer('authorId').notNull();
        collection.string('bio').notNull();
      },
    },
    {
      name: 'repositoryPublishers',
      definition: (collection) => {
        collection.increments('id');
        collection.string('name').notNull();
      },
    },
    {
      name: 'repositoryTags',
      definition: (collection) => {
        collection.increments('id');
        collection.string('label').notNull();
      },
    },
    {
      name: 'repositoryBookTags',
      definition: (collection) => {
        collection.increments('id');
        collection.integer('bookId').notNull();
        collection.integer('tagId').notNull();
      },
    },
    {
      name: 'repositoryBooks',
      definition: (collection) => {
        collection.increments('id');
        collection.string('title').notNull();
        collection.integer('pages').notNull();
        collection.integer('authorId').notNull();
        collection
          .belongsTo('author', 'repositoryAuthors')
          .targetKey('id')
          .foreignKey('authorId')
          .constraints(false);
        collection
          .belongsTo('publisher', 'repositoryPublishers')
          .targetKey('id')
          .foreignKey('publisherId')
          .foreignKeyType('integer')
          .constraints(false);
        collection
          .belongsToMany('tags', 'repositoryTags')
          .sourceKey('id')
          .targetKey('id')
          .through('repositoryBookTags')
          .foreignKey('bookId')
          .otherKey('tagId');
      },
    },
  ]);

  const authors = context.database.repository('repositoryAuthors');
  const profiles = context.database.repository('repositoryProfiles');
  const publishers = context.database.repository('repositoryPublishers');
  const books = context.database.repository('repositoryBooks');
  const tags = context.database.repository('repositoryTags');
  const bookTags = context.database.repository('repositoryBookTags');
  const ada = await authors.createOne({ values: { name: 'Ada' } });
  const bob = await authors.createOne({ values: { name: 'Bob' } });
  await authors.createOne({ values: { name: 'Cara' } });
  await profiles.createOne({
    values: { authorId: ada.record.id, bio: 'compiler engineer' },
  });
  const north = await publishers.createOne({ values: { name: 'North' } });
  const south = await publishers.createOne({ values: { name: 'South' } });
  const alpha = await books.createOne({
    values: {
      title: 'Alpha',
      pages: 180,
      authorId: ada.record.id,
      publisherId: north.record.id,
    },
  });
  await books.createOne({
    values: {
      title: 'Beta',
      pages: 260,
      authorId: ada.record.id,
      publisherId: null,
    },
  });
  const gamma = await books.createOne({
    values: {
      title: 'Gamma',
      pages: 90,
      authorId: bob.record.id,
      publisherId: south.record.id,
    },
  });
  const databaseTag = await tags.createOne({ values: { label: 'database' } });
  const typescriptTag = await tags.createOne({
    values: { label: 'typescript' },
  });
  await bookTags.createMany({
    values: [
      { bookId: alpha.record.id, tagId: databaseTag.record.id },
      { bookId: alpha.record.id, tagId: typescriptTag.record.id },
      { bookId: gamma.record.id, tagId: databaseTag.record.id },
    ],
  });
}

export function selection(
  fields: readonly string[],
  includes?: readonly SelectIncludeNode[],
): SelectAst {
  return {
    kind: 'select',
    version: 1,
    root: selectionNode(fields, includes),
  };
}

export function selectionNode(
  fields: readonly string[],
  includes?: readonly SelectIncludeNode[],
): SelectAst['root'] {
  return { kind: 'selection', fields, includes };
}

export function relation(
  relation: string,
  select: SelectAst['root'],
  filter?: FilterAst,
  sort?: SortAst,
): SelectIncludeNode {
  return { kind: 'include', relation, select, filter, sort };
}

export function sorting(field: string, direction: 'asc' | 'desc'): SortAst {
  return {
    kind: 'sort',
    version: 1,
    items: [{ kind: 'field', path: [field], direction }],
  };
}

export function relationFieldSort(
  relationPath: readonly string[],
  field: string,
  direction: 'asc' | 'desc',
): SortAst {
  return {
    kind: 'sort',
    version: 1,
    items: [
      {
        kind: 'field',
        path: [...relationPath, field],
        direction,
      },
    ],
  };
}

export function relationCountSort(
  relationPath: readonly string[],
  direction: 'asc' | 'desc',
): SortAst {
  return {
    kind: 'sort',
    version: 1,
    items: [
      {
        kind: 'aggregate',
        relation: relationPath,
        aggregate: 'count',
        direction,
      },
    ],
  };
}

export function filterAst(
  field: string,
  operator: '$gt',
  value: number,
): FilterAst {
  return {
    kind: 'filter',
    version: 1,
    root: {
      kind: 'group',
      logic: 'and',
      items: [{ kind: 'condition', path: [field], operator, value }],
    },
  };
}

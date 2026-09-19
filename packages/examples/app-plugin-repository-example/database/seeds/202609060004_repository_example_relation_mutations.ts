import { defineSeed, type SeedDefinition } from '@nocobase/db';

interface SeedGroup {
  readonly collection: string;
  readonly identity: Readonly<Record<string, string>>;
  readonly record: Readonly<Record<string, string | number | null>>;
}

const groups: readonly SeedGroup[] = [
  {
    collection: 'repositoryExampleRelationUsers',
    identity: { id: 'user-1' },
    record: {
      id: 'user-1',
      name: 'Ada',
      email: 'ada@relation.example',
    },
  },
  {
    collection: 'repositoryExampleRelationUsers',
    identity: { id: 'user-2' },
    record: {
      id: 'user-2',
      name: 'Bob',
      email: 'bob@relation.example',
    },
  },
  {
    collection: 'repositoryExampleRelationTags',
    identity: { id: 'tag-db' },
    record: { id: 'tag-db', label: 'Database' },
  },
  {
    collection: 'repositoryExampleRelationTags',
    identity: { id: 'tag-docs' },
    record: { id: 'tag-docs', label: 'Documentation' },
  },
  {
    collection: 'repositoryExampleRelationTags',
    identity: { id: 'tag-orm' },
    record: { id: 'tag-orm', label: 'ORM' },
  },
  {
    collection: 'repositoryExampleRelationProjects',
    identity: { id: 'project-1' },
    record: {
      id: 'project-1',
      name: 'Repository guide',
      status: 'draft',
      ownerId: 'user-1',
    },
  },
  {
    collection: 'repositoryExampleRelationProjects',
    identity: { id: 'project-other' },
    record: {
      id: 'project-other',
      name: 'Other project',
      status: 'draft',
      ownerId: 'user-2',
    },
  },
  {
    collection: 'repositoryExampleRelationProjectProfiles',
    identity: { id: 'profile-current' },
    record: {
      id: 'profile-current',
      summary: 'Current project profile',
      projectId: 'project-1',
    },
  },
  {
    collection: 'repositoryExampleRelationProjectProfiles',
    identity: { id: 'profile-existing' },
    record: {
      id: 'profile-existing',
      summary: 'Unassigned profile',
      projectId: null,
    },
  },
  {
    collection: 'repositoryExampleRelationTasks',
    identity: { id: 'task-existing' },
    record: {
      id: 'task-existing',
      title: 'Existing unassigned task',
      status: 'draft',
      points: 0,
      projectId: null,
      assigneeId: 'user-1',
    },
  },
  {
    collection: 'repositoryExampleRelationTasks',
    identity: { id: 'task-edit' },
    record: {
      id: 'task-edit',
      title: 'Task to edit',
      status: 'draft',
      points: 0,
      projectId: 'project-1',
      assigneeId: 'user-1',
    },
  },
  {
    collection: 'repositoryExampleRelationTasks',
    identity: { id: 'task-detached' },
    record: {
      id: 'task-detached',
      title: 'Task to disconnect',
      status: 'draft',
      points: 0,
      projectId: 'project-1',
      assigneeId: null,
    },
  },
  {
    collection: 'repositoryExampleRelationTasks',
    identity: { id: 'task-obsolete' },
    record: {
      id: 'task-obsolete',
      title: 'Task to delete',
      status: 'draft',
      points: 0,
      projectId: 'project-1',
      assigneeId: null,
    },
  },
  {
    collection: 'repositoryExampleRelationTasks',
    identity: { id: 'task-outside' },
    record: {
      id: 'task-outside',
      title: 'Task owned by another project',
      status: 'draft',
      points: 0,
      projectId: 'project-other',
      assigneeId: 'user-2',
    },
  },
  {
    collection: 'repositoryExampleRelationProjectTags',
    identity: { projectId: 'project-1', tagId: 'tag-docs' },
    record: {
      projectId: 'project-1',
      tagId: 'tag-docs',
      role: 'secondary',
    },
  },
  {
    collection: 'repositoryExampleRelationProjectTags',
    identity: { projectId: 'project-other', tagId: 'tag-orm' },
    record: {
      projectId: 'project-other',
      tagId: 'tag-orm',
      role: 'primary',
    },
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609060004_repository_example_relation_mutations',
  transaction: true,
  async run({ query }) {
    for (const { collection, identity, record } of groups) {
      let lookup = query.selectFrom(collection).selectAll();
      for (const [field, value] of Object.entries(identity))
        lookup = lookup.where(field, '=', value);
      if (!(await lookup.executeTakeFirst()))
        await query.insertInto(collection).values(record).execute();
    }
  },
});

export default seed;

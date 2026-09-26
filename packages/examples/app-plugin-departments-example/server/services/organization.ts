import type { UserAdministrationService } from '@nocobase/app-plugin-authentication';
import type { AuthorizationTitle } from '@nocobase/authorization/core';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';

import { label, SALES_MEMBERS } from '../resources.js';
import { readTitle, titleTexts } from '../titles.js';
import {
  OrganizationError,
  type AddMemberInput,
  type CreateDepartmentInput,
  type Department,
  type DirectMember,
  type OrganizationOption,
  type OrganizationPageQuery,
  type OrganizationService,
  type UpdateDepartmentInput,
  type UpdateDepartmentResult,
} from '../tokens.js';

export interface OrganizationServiceDependencies {
  readonly database: DatabaseManager;
  readonly users: Pick<UserAdministrationService, 'get' | 'list'>;
  readonly generateId: () => string;
}

interface TreeNode {
  readonly id: string;
  readonly title: AuthorizationTitle;
  readonly parentId: string | null;
  readonly region: string | null;
  readonly managerId: string | null;
  readonly active: boolean;
  readonly sortOrder: number;
}

type Tree = ReadonlyMap<string, TreeNode>;

const DEPARTMENT_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** A scalar column as text; ids and titles come back as strings, numbers or bigints depending on the dialect. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint')
    return value.toString();
  throw new TypeError('Expected a scalar column value.');
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function toNode(row: Record<string, unknown>): TreeNode {
  return {
    id: text(row.id),
    title: readTitle(text(row.title)),
    parentId:
      row.parentId === null || row.parentId === undefined
        ? null
        : text(row.parentId),
    region:
      row.region === null || row.region === undefined ? null : text(row.region),
    managerId:
      row.managerId === null || row.managerId === undefined
        ? null
        : text(row.managerId),
    active: toBoolean(row.active),
    sortOrder: Number(row.sortOrder ?? 0),
  };
}

/** The English text of a title, which orders departments that share a sort order. */
function sortText(title: AuthorizationTitle): string {
  return titleTexts(title)[0] ?? '';
}

function compareNodes(left: TreeNode, right: TreeNode): number {
  return (
    left.sortOrder - right.sortOrder ||
    sortText(left.title).localeCompare(sortText(right.title)) ||
    left.id.localeCompare(right.id)
  );
}

/** The department and its ancestors, nearest first; a cycle or missing parent ends the walk. */
function chainOf(tree: Tree, id: string): TreeNode[] | undefined {
  const chain: TreeNode[] = [];
  const visited = new Set<string>();
  let current: string | null = id;
  while (current !== null) {
    if (visited.has(current)) return undefined;
    visited.add(current);
    const node = tree.get(current);
    if (!node) return undefined;
    chain.push(node);
    current = node.parentId;
  }
  return chain;
}

function activeChainOf(tree: Tree, id: string): string[] | undefined {
  const chain = chainOf(tree, id);
  if (!chain || chain.some((node) => !node.active)) return undefined;
  return chain.map((node) => node.id);
}

/** The department and every descendant, whether active or not. */
function subtreeOf(tree: Tree, id: string): TreeNode[] {
  const children = new Map<string, TreeNode[]>();
  for (const node of tree.values()) {
    if (node.parentId === null) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const root = tree.get(id);
  if (!root) return [];
  const result: TreeNode[] = [];
  const visited = new Set<string>();
  const pending: TreeNode[] = [root];
  while (pending.length) {
    const node = pending.shift();
    if (!node || visited.has(node.id)) continue;
    visited.add(node.id);
    result.push(node);
    pending.push(...(children.get(node.id) ?? []));
  }
  return result;
}

/** The departments and every descendant whose whole chain is active. */
function activeSubtrees(tree: Tree, ids: readonly string[]): string[] {
  const result = new Set<string>();
  for (const id of ids) {
    if (activeChainOf(tree, id) === undefined) continue;
    for (const node of subtreeOf(tree, id))
      if (activeChainOf(tree, node.id) !== undefined) result.add(node.id);
  }
  return [...result];
}

/** Active departments the user heads. */
function headedIn(tree: Tree, userId: string): string[] {
  return [...tree.values()]
    .filter(
      (node) =>
        node.managerId === userId && activeChainOf(tree, node.id) !== undefined,
    )
    .map((node) => node.id);
}

function validatePage(query: OrganizationPageQuery): void {
  if (
    !Number.isInteger(query.page) ||
    query.page < 1 ||
    !Number.isInteger(query.pageSize) ||
    query.pageSize < 1 ||
    query.pageSize > 100
  ) {
    throw new OrganizationError('INVALID_INPUT', 'Invalid pagination.');
  }
}

function normalizeTitle(title: unknown): string {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 255)
    throw new OrganizationError(
      'INVALID_INPUT',
      'A title of 1 to 255 characters is required.',
    );
  return title.trim();
}

function normalizeRegion(region: unknown): string | null {
  if (region === null) return null;
  if (typeof region !== 'string' || !region.trim() || region.trim().length > 64)
    throw new OrganizationError(
      'INVALID_INPUT',
      'A region is null or 1 to 64 characters.',
    );
  return region.trim();
}

/**
 * The region the organisation gives a user: the region of its primary department when that has one, else the
 * first other active department with a region, in tree order.
 */
function regionFrom(
  tree: Tree,
  memberships: readonly { departmentId: string; primary: boolean }[],
): string | null {
  const regional = memberships
    .map((membership) => ({
      membership,
      node: tree.get(membership.departmentId),
    }))
    .filter(
      (
        entry,
      ): entry is { membership: typeof entry.membership; node: TreeNode } =>
        entry.node?.region != null &&
        activeChainOf(tree, entry.membership.departmentId) !== undefined,
    )
    .sort(
      (left, right) =>
        Number(right.membership.primary) - Number(left.membership.primary) ||
        compareNodes(left.node, right.node),
    );
  return regional[0]?.node.region ?? null;
}

export function createOrganizationService(
  dependencies: OrganizationServiceDependencies,
): OrganizationService {
  const { database, users, generateId } = dependencies;

  async function loadTree(connection?: DatabaseConnection): Promise<Tree> {
    const rows = await (connection ?? database.connection()).query
      .selectFrom('departments')
      .select([
        'id',
        'title',
        'parentId',
        'region',
        'managerId',
        'active',
        'sortOrder',
      ])
      .execute();
    return new Map(
      rows.map((row) => {
        const node = toNode(row);
        return [node.id, node];
      }),
    );
  }

  async function activeMemberships(
    connection: DatabaseConnection,
    where: { userId?: string; departmentIds?: readonly string[] },
  ): Promise<{ departmentId: string; userId: string; primary: boolean }[]> {
    if (where.departmentIds && where.departmentIds.length === 0) return [];
    let query = connection.query
      .selectFrom('departmentMembers')
      .select(['departmentId', 'userId', 'primary'])
      .where('active', '=', true);
    if (where.userId !== undefined)
      query = query.where('userId', '=', where.userId);
    if (where.departmentIds)
      query = query.where('departmentId', 'in', [...where.departmentIds]);
    const rows = await query.execute();
    return rows.map((row) => ({
      departmentId: String(row.departmentId),
      userId: String(row.userId),
      primary: toBoolean(row.primary),
    }));
  }

  /**
   * The HR-sync step: the organisation is the source of truth for the sales region of everyone it touches, so each
   * write re-derives the region of those users and writes the authorization example's sales-member row the "own
   * region" record access reads. A user left without a regional department loses the row.
   */
  async function syncRegions(
    connection: DatabaseConnection,
    userIds: readonly string[],
  ): Promise<void> {
    if (!userIds.length) return;
    const tree = await loadTree(connection);
    for (const userId of new Set(userIds)) {
      const region = regionFrom(
        tree,
        await activeMemberships(connection, { userId }),
      );
      const existing = await connection.query
        .selectFrom(SALES_MEMBERS)
        .select('region')
        .where('id', '=', userId)
        .executeTakeFirst();
      if (region === null) {
        if (existing)
          await connection.query
            .deleteFrom(SALES_MEMBERS)
            .where('id', '=', userId)
            .execute();
      } else if (!existing) {
        await connection.query
          .insertInto(SALES_MEMBERS)
          .values({ id: userId, region })
          .execute();
      } else if (String(existing.region) !== region) {
        await connection.query
          .updateTable(SALES_MEMBERS)
          .set({ region })
          .where('id', '=', userId)
          .execute();
      }
    }
  }

  async function requireDepartment(
    connection: DatabaseConnection,
    id: string,
  ): Promise<void> {
    const row = await connection.query
      .selectFrom('departments')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new OrganizationError(
        'DEPARTMENT_NOT_FOUND',
        `Department "${id}" does not exist.`,
      );
  }

  async function requireEnabledUser(userId: string): Promise<void> {
    const user =
      typeof userId === 'string' && userId
        ? await users.get(userId)
        : undefined;
    if (!user || user.disabledAt)
      throw new OrganizationError(
        'USER_NOT_FOUND',
        `User "${String(userId)}" does not exist or is disabled.`,
      );
  }

  async function clearPrimary(
    connection: DatabaseConnection,
    userId: string,
  ): Promise<void> {
    await connection.query
      .updateTable('departmentMembers')
      .set({ primary: false })
      .where('userId', '=', userId)
      .where('primary', '=', true)
      .execute();
  }

  async function subtreeMemberIds(
    connection: DatabaseConnection,
    id: string,
  ): Promise<string[]> {
    const tree = await loadTree(connection);
    const departmentIds = subtreeOf(tree, id).map((node) => node.id);
    const memberships = await activeMemberships(connection, { departmentIds });
    return [...new Set(memberships.map((row) => row.userId))];
  }

  function validateParent(
    tree: Tree,
    id: string | undefined,
    parentId: string | null,
  ): void {
    if (parentId === null) return;
    if (!tree.has(parentId))
      throw new OrganizationError(
        'PARENT_NOT_FOUND',
        `Parent department "${parentId}" does not exist.`,
      );
    if (id === undefined) return;
    // The new parent must not be the department itself or one of its descendants.
    const ancestors = chainOf(tree, parentId);
    if (!ancestors || ancestors.some((node) => node.id === id))
      throw new OrganizationError(
        'PARENT_CYCLE',
        'A department cannot be moved below itself.',
      );
  }

  function toDepartment(node: TreeNode): Department {
    return { ...node };
  }

  return {
    async listTree(connection) {
      return [...(await loadTree(connection)).values()]
        .sort(compareNodes)
        .map(toDepartment);
    },

    async getDepartment(id) {
      const node = (await loadTree()).get(id);
      return node ? toDepartment(node) : undefined;
    },

    async createDepartment(input: CreateDepartmentInput): Promise<Department> {
      const title = normalizeTitle(input.title);
      const region =
        input.region === undefined ? null : normalizeRegion(input.region);
      const id = input.id ?? generateId();
      if (typeof id !== 'string' || !DEPARTMENT_ID.test(id))
        throw new OrganizationError(
          'INVALID_INPUT',
          'A department id uses lowercase letters, digits, ".", "_" and "-".',
        );
      const parentId = input.parentId ?? null;
      const sortOrder = input.sortOrder ?? 0;
      if (!Number.isInteger(sortOrder))
        throw new OrganizationError('INVALID_INPUT', 'Invalid sort order.');
      const managerId = input.managerId ?? null;
      if (managerId !== null) await requireEnabledUser(managerId);
      return database.transaction(async (connection) => {
        const tree = await loadTree(connection);
        if (tree.has(id))
          throw new OrganizationError(
            'DEPARTMENT_EXISTS',
            `Department "${id}" already exists.`,
          );
        validateParent(tree, undefined, parentId);
        await connection.query
          .insertInto('departments')
          .values({
            id,
            title,
            parentId,
            region,
            managerId,
            active: true,
            sortOrder,
          })
          .execute();
        return {
          id,
          title,
          parentId,
          region,
          managerId,
          active: true,
          sortOrder,
        };
      });
    },

    async updateDepartment(
      id: string,
      input: UpdateDepartmentInput,
    ): Promise<UpdateDepartmentResult> {
      const values: Record<string, unknown> = {};
      if (input.title !== undefined) values.title = normalizeTitle(input.title);
      if (input.region !== undefined)
        values.region = normalizeRegion(input.region);
      if (input.sortOrder !== undefined) {
        if (!Number.isInteger(input.sortOrder))
          throw new OrganizationError('INVALID_INPUT', 'Invalid sort order.');
        values.sortOrder = input.sortOrder;
      }
      if (input.managerId !== undefined) {
        if (input.managerId !== null) await requireEnabledUser(input.managerId);
        values.managerId = input.managerId;
      }
      return database.transaction(async (connection) => {
        const tree = await loadTree(connection);
        const current = tree.get(id);
        if (!current)
          throw new OrganizationError(
            'DEPARTMENT_NOT_FOUND',
            `Department "${id}" does not exist.`,
          );
        let changed: string[] = [];
        if (
          input.parentId !== undefined &&
          input.parentId !== current.parentId
        ) {
          validateParent(tree, id, input.parentId);
          values.parentId = input.parentId;
          // Moving a department changes what its members inherit.
          changed = await subtreeMemberIds(connection, id);
          // Heads in the moved subtree and above its old and new place now reach different departments.
          const heads = [
            ...subtreeOf(tree, id),
            ...(current.parentId === null
              ? []
              : (chainOf(tree, current.parentId) ?? [])),
            ...(input.parentId === null
              ? []
              : (chainOf(tree, input.parentId) ?? [])),
          ];
          for (const node of heads)
            if (node.managerId !== null) changed.push(node.managerId);
        }
        // A new head gains the department's scope and the old one loses it.
        if ('managerId' in values && values.managerId !== current.managerId) {
          if (current.managerId !== null) changed.push(current.managerId);
          if (typeof values.managerId === 'string')
            changed.push(values.managerId);
        }
        if (Object.keys(values).length) {
          await connection.query
            .updateTable('departments')
            .set(values)
            .where('id', '=', id)
            .execute();
        }
        // A new region reaches the department's own members through the sync.
        if ('region' in values && values.region !== current.region)
          await syncRegions(
            connection,
            (await activeMemberships(connection, { departmentIds: [id] })).map(
              (row) => row.userId,
            ),
          );
        const department = (await loadTree(connection)).get(id);
        if (!department)
          throw new OrganizationError(
            'DEPARTMENT_NOT_FOUND',
            `Department "${id}" does not exist.`,
          );
        return {
          department: toDepartment(department),
          changed: [...new Set(changed)],
        };
      });
    },

    async listDepartments(query) {
      validatePage(query);
      const search = query.search?.trim().toLowerCase();
      const tree = await loadTree();
      // The tree is small and seeded titles are translation keys, so the search runs over their shipped
      // translations in memory; `%` and `_` mean themselves.
      const matches = [...tree.values()]
        .filter(
          (node) =>
            node.active &&
            (!search ||
              titleTexts(node.title).some((text) =>
                text.toLowerCase().includes(search),
              )),
        )
        .sort(
          (left, right) =>
            sortText(left.title).localeCompare(sortText(right.title)) ||
            left.id.localeCompare(right.id),
        );
      const offset = (query.page - 1) * query.pageSize;
      return {
        items: matches
          .slice(offset, offset + query.pageSize)
          .map((node) => optionOf(tree, node)),
        total: matches.length,
      };
    },

    async resolveDepartments(ids) {
      if (!ids.length) return [];
      const tree = await loadTree();
      const options: OrganizationOption[] = [];
      for (const id of new Set(ids)) {
        const node = tree.get(id);
        if (node) options.push(optionOf(tree, node));
      }
      return options;
    },

    async activeChain(departmentId, connection) {
      return activeChainOf(await loadTree(connection), departmentId);
    },

    async filterActive(ids, connection) {
      if (!ids.length) return [];
      const tree = await loadTree(connection);
      return ids.filter((id) => activeChainOf(tree, id) !== undefined);
    },

    async departmentsOf(userId, connection) {
      const target = connection ?? database.connection();
      const memberships = await activeMemberships(target, { userId });
      if (!memberships.length) return [];
      const tree = await loadTree(target);
      const result = new Set<string>();
      for (const membership of memberships) {
        for (const id of activeChainOf(tree, membership.departmentId) ?? [])
          result.add(id);
      }
      return [...result];
    },

    async headedBy(userId, connection) {
      return headedIn(await loadTree(connection), userId);
    },

    async viewerDepartments(userId, { descendants }) {
      const connection = database.connection();
      const tree = await loadTree(connection);
      const direct = new Set(headedIn(tree, userId));
      for (const membership of await activeMemberships(connection, { userId }))
        if (activeChainOf(tree, membership.departmentId) !== undefined)
          direct.add(membership.departmentId);
      return descendants ? activeSubtrees(tree, [...direct]) : [...direct];
    },

    async membersOf(departmentIds) {
      const memberships = await activeMemberships(database.connection(), {
        departmentIds,
      });
      return [...new Set(memberships.map((row) => row.userId))];
    },

    async regionOf(userId, connection) {
      const target = connection ?? database.connection();
      return regionFrom(
        await loadTree(target),
        await activeMemberships(target, { userId }),
      );
    },

    async directMembers(departmentId) {
      const connection = database.connection();
      await requireDepartment(connection, departmentId);
      const memberships = await activeMemberships(connection, {
        departmentIds: [departmentId],
      });
      if (!memberships.length) return [];
      const primary = new Map(
        memberships.map((row) => [row.userId, row.primary] as const),
      );
      const members: DirectMember[] = [];
      // The user directory pages at 100; read every page of this department's members.
      for (let page = 1; ; page += 1) {
        const result = await users.list({
          userIds: [...primary.keys()],
          page,
          pageSize: 100,
        });
        for (const user of result.items) {
          members.push({
            userId: user.id,
            title: user.name,
            description: user.email,
            primary: primary.get(user.id) ?? false,
          });
        }
        if (page * 100 >= result.total) break;
      }
      return members.sort(
        (left, right) =>
          left.title.localeCompare(right.title) ||
          left.userId.localeCompare(right.userId),
      );
    },

    async addMember(input: AddMemberInput) {
      await requireEnabledUser(input.userId);
      return database.transaction(async (connection) => {
        await requireDepartment(connection, input.departmentId);
        const existing = await connection.query
          .selectFrom('departmentMembers')
          .select(['id', 'active', 'primary'])
          .where('departmentId', '=', input.departmentId)
          .where('userId', '=', input.userId)
          .executeTakeFirst();
        const others = await activeMemberships(connection, {
          userId: input.userId,
        });
        const hasPrimary = others.some(
          (row) => row.primary && row.departmentId !== input.departmentId,
        );
        const primary = input.primary ?? !hasPrimary;
        if (
          existing &&
          toBoolean(existing.active) &&
          toBoolean(existing.primary) === primary
        )
          return [];
        if (primary) await clearPrimary(connection, input.userId);
        if (existing) {
          await connection.query
            .updateTable('departmentMembers')
            .set({ active: true, primary })
            .where('id', '=', String(existing.id))
            .execute();
        } else {
          await connection.query
            .insertInto('departmentMembers')
            .values({
              id: generateId(),
              departmentId: input.departmentId,
              userId: input.userId,
              primary,
              active: true,
            })
            .execute();
        }
        await syncRegions(connection, [input.userId]);
        return [input.userId];
      });
    },

    async removeMember(departmentId, userId) {
      return database.transaction(async (connection) => {
        await requireDepartment(connection, departmentId);
        const membership = await connection.query
          .selectFrom('departmentMembers')
          .select('id')
          .where('departmentId', '=', departmentId)
          .where('userId', '=', userId)
          .where('active', '=', true)
          .executeTakeFirst();
        if (!membership)
          throw new OrganizationError(
            'MEMBER_NOT_FOUND',
            `User "${userId}" is not a member of "${departmentId}".`,
          );
        // Memberships are disabled, not deleted, so history and a later re-add keep the same row.
        await connection.query
          .updateTable('departmentMembers')
          .set({ active: false, primary: false })
          .where('id', '=', String(membership.id))
          .execute();
        await syncRegions(connection, [userId]);
        return [userId];
      });
    },

    async setPrimary(departmentId, userId) {
      return database.transaction(async (connection) => {
        await requireDepartment(connection, departmentId);
        const membership = await connection.query
          .selectFrom('departmentMembers')
          .select(['id', 'primary'])
          .where('departmentId', '=', departmentId)
          .where('userId', '=', userId)
          .where('active', '=', true)
          .executeTakeFirst();
        if (!membership)
          throw new OrganizationError(
            'MEMBER_NOT_FOUND',
            `User "${userId}" is not a member of "${departmentId}".`,
          );
        if (toBoolean(membership.primary)) return [];
        await clearPrimary(connection, userId);
        await connection.query
          .updateTable('departmentMembers')
          .set({ primary: true })
          .where('id', '=', String(membership.id))
          .execute();
        await syncRegions(connection, [userId]);
        return [userId];
      });
    },

    async setActive(departmentId, active) {
      if (typeof active !== 'boolean')
        throw new OrganizationError('INVALID_INPUT', '`active` is a boolean.');
      return database.transaction(async (connection) => {
        const tree = await loadTree(connection);
        const current = tree.get(departmentId);
        if (!current)
          throw new OrganizationError(
            'DEPARTMENT_NOT_FOUND',
            `Department "${departmentId}" does not exist.`,
          );
        if (current.active === active) return [];
        await connection.query
          .updateTable('departments')
          .set({ active })
          .where('id', '=', departmentId)
          .execute();
        // Disabling a parent is a check on the chain, not a cascade: every member below it is affected.
        const members = await subtreeMemberIds(connection, departmentId);
        await syncRegions(connection, members);
        // So is every head of a department in the subtree.
        const heads = subtreeOf(tree, departmentId)
          .map((node) => node.managerId)
          .filter((id): id is string => id !== null);
        return [...new Set([...members, ...heads])];
      });
    },
  };
}

/** A picker entry: the parent's title as the description, or a disabled marker the client translates. */
function optionOf(tree: Tree, node: TreeNode): OrganizationOption {
  const parent = node.parentId === null ? undefined : tree.get(node.parentId);
  const description =
    activeChainOf(tree, node.id) === undefined
      ? label('subject.disabled')
      : parent?.title;
  return {
    id: node.id,
    title: node.title,
    ...(description === undefined ? {} : { description }),
  };
}

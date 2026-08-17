import type {
  BaseRecord,
  CreateManyParams,
  CreateManyResponse,
  CreateParams,
  CreateResponse,
  DataProvider,
  DeleteManyParams,
  DeleteManyResponse,
  DeleteOneParams,
  DeleteOneResponse,
  GetListParams,
  GetListResponse,
  GetManyParams,
  GetManyResponse,
  GetOneParams,
  GetOneResponse,
  MetaQuery,
  UpdateManyParams,
  UpdateManyResponse,
  UpdateParams,
  UpdateResponse,
} from "@refinedev/core";

import { nocobaseClient } from "../client/index.ts";
import {
  resolveAclDataSourceKey,
  type ResourceAcl,
  updateRecordPermissions,
} from "../acl/index.ts";

type NocoBaseListResponse<T> = {
  rows?: T[];
  count?: number;
  data?: T[] | NocoBaseListResponse<T>;
  meta?: {
    count?: number;
    allowedActions?: Record<string, Array<string | number>>;
  };
  allowedActions?: Record<string, Array<string | number>>;
};

type NocoBaseGetResponse<T> = {
  data?: T;
  meta?: {
    allowedActions?: Record<string, Array<string | number>>;
  };
};

type NocoBaseMeta = MetaQuery & {
  appends?: string[];
  token?: string;
  dataSourceKey?: string;
  idField?: string;
  acl?: ResourceAcl;
};

type NocoBaseFilter = Record<string, unknown>;

const toNocoBaseFilter = (
  filters: GetListParams["filters"] = []
): NocoBaseFilter | undefined => {
  const filterItems: NocoBaseFilter[] = filters.flatMap((filter) => {
    if ("field" in filter) {
      const operatorMap: Record<string, string> = {
        eq: "$eq",
        ne: "$ne",
        lt: "$lt",
        gt: "$gt",
        lte: "$lte",
        gte: "$gte",
        in: "$in",
        nin: "$notIn",
        contains: "$includes",
        containss: "$includes",
        startswith: "$startsWith",
        endswith: "$endsWith",
        null: "$null",
        nnull: "$notNull",
        between: "$between",
        nbetween: "$notBetween",
      };

      const operator = operatorMap[filter.operator] ?? "$eq";
      return [{ [filter.field]: { [operator]: filter.value } }];
    }

    const value = toNocoBaseFilter(filter.value as GetListParams["filters"]);
    return value ? [{ [`$${filter.operator}`]: value.$and ?? [value] }] : [];
  });

  if (!filterItems.length) return undefined;
  return filterItems.length === 1 ? filterItems[0] : { $and: filterItems };
};

const request = async <T>(
  resource: string,
  action: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    meta?: NocoBaseMeta;
    unwrapData?: boolean;
  } = {}
): Promise<T> => {
  const dataSourceKey = resolveAclDataSourceKey(options.meta);
  const fields = Array.isArray(options.meta?.fields)
    ? options.meta.fields.filter(
        (field): field is string => typeof field === "string"
      )
    : undefined;
  return nocobaseClient.action<T>(resource, action, {
    method: options.method,
    query: {
      ...options.query,
      ...(options.meta?.appends?.length
        ? { "appends[]": options.meta.appends }
        : {}),
      ...(fields?.length ? { "fields[]": fields } : {}),
    },
    body: options.body,
    token: options.meta?.token,
    headers: dataSourceKey ? { "X-Data-Source": dataSourceKey } : undefined,
    unwrap: options.unwrapData === false ? "none" : "data",
  });
};

const getAllowedActions = (response: NocoBaseListResponse<unknown>) =>
  response.meta?.allowedActions ??
  response.allowedActions ??
  (!Array.isArray(response.data) && response.data
    ? response.data.meta?.allowedActions ?? response.data.allowedActions
    : undefined);

const cacheAllowedActions = <TData extends BaseRecord>({
  resource,
  records,
  response,
  meta,
}: {
  resource: string;
  records: TData[];
  response: NocoBaseListResponse<TData>;
  meta?: NocoBaseMeta;
}) => {
  const idField = meta?.idField ?? "id";
  const dataSourceKey = resolveAclDataSourceKey(meta);
  const recordIds = records
    .map((record) => record[idField])
    .filter(
      (id): id is string | number =>
        typeof id === "string" || typeof id === "number"
    );
  return updateRecordPermissions({
    dataSourceKey,
    resource,
    recordIds,
    allowedActions: getAllowedActions(response),
  });
};

const getResponseData = <TData extends BaseRecord>(
  response: NocoBaseGetResponse<TData>
) => response.data ?? (response as TData);

export const dataProvider: DataProvider = {
  async getList<TData extends BaseRecord = BaseRecord>({
    resource,
    pagination,
    sorters,
    filters,
    meta,
  }: GetListParams): Promise<GetListResponse<TData>> {
    const page = pagination?.currentPage ?? 1;
    const pageSize = pagination?.pageSize ?? 10;
    const filter = toNocoBaseFilter(filters);
    const sort = sorters?.map(
      (sorter) => `${sorter.order === "desc" ? "-" : ""}${sorter.field}`
    );
    const response = await request<NocoBaseListResponse<TData>>(
      resource,
      "list",
      {
        query: {
          page,
          pageSize,
          ...(filter ? { filter: JSON.stringify(filter) } : {}),
          ...(sort?.length ? { sort: sort.join(",") } : {}),
        },
        meta,
        unwrapData: false,
      }
    );

    const list = Array.isArray(response.data)
      ? { rows: response.data, count: response.meta?.count }
      : response.data ?? response;
    const records = list.rows ?? [];
    cacheAllowedActions({ resource, records, response, meta });

    return {
      data: records,
      total: list.count ?? records.length,
      meta: response.meta,
    };
  },

  async getOne<TData extends BaseRecord = BaseRecord>({
    resource,
    id,
    meta,
  }: GetOneParams): Promise<GetOneResponse<TData>> {
    const response = await request<NocoBaseGetResponse<TData>>(
      resource,
      "get",
      {
        query: { filterByTk: id },
        meta,
        unwrapData: false,
      }
    );
    const data = getResponseData(response);
    cacheAllowedActions({
      resource,
      records: [data],
      response: response as NocoBaseListResponse<TData>,
      meta,
    });
    return {
      data,
    };
  },

  async getMany<TData extends BaseRecord = BaseRecord>({
    resource,
    ids,
    meta,
  }: GetManyParams): Promise<GetManyResponse<TData>> {
    const responses = await Promise.all(
      ids.map((id) =>
        request<NocoBaseGetResponse<TData>>(resource, "get", {
          query: { filterByTk: id },
          meta,
          unwrapData: false,
        })
      )
    );
    const data = responses.map(getResponseData);
    responses.forEach((response, index) => {
      cacheAllowedActions({
        resource,
        records: [data[index]],
        response: response as NocoBaseListResponse<TData>,
        meta,
      });
    });
    return { data };
  },

  async create<
    TData extends BaseRecord = BaseRecord,
    TVariables = Record<string, unknown>
  >({
    resource,
    variables,
    meta,
  }: CreateParams<TVariables>): Promise<CreateResponse<TData>> {
    return {
      data: await request<TData>(resource, "create", {
        method: "POST",
        body: variables,
        meta,
      }),
    };
  },

  async createMany<
    TData extends BaseRecord = BaseRecord,
    TVariables = Record<string, unknown>
  >({
    resource,
    variables,
    meta,
  }: CreateManyParams<TVariables>): Promise<CreateManyResponse<TData>> {
    const data = await Promise.all(
      variables.map((values) =>
        request<TData>(resource, "create", {
          method: "POST",
          body: values,
          meta,
        })
      )
    );
    return { data };
  },

  async update<
    TData extends BaseRecord = BaseRecord,
    TVariables = Record<string, unknown>
  >({
    resource,
    id,
    variables,
    meta,
  }: UpdateParams<TVariables>): Promise<UpdateResponse<TData>> {
    return {
      data: await request<TData>(resource, "update", {
        method: "POST",
        query: { filterByTk: id },
        body: variables,
        meta,
      }),
    };
  },

  async updateMany<
    TData extends BaseRecord = BaseRecord,
    TVariables = Record<string, unknown>
  >({
    resource,
    ids,
    variables,
    meta,
  }: UpdateManyParams<TVariables>): Promise<UpdateManyResponse<TData>> {
    const data = await Promise.all(
      ids.map((id) =>
        request<TData>(resource, "update", {
          method: "POST",
          query: { filterByTk: id },
          body: variables,
          meta,
        })
      )
    );
    return { data };
  },

  async deleteOne<
    TData extends BaseRecord = BaseRecord,
    TVariables = Record<string, unknown>
  >({
    resource,
    id,
    meta,
  }: DeleteOneParams<TVariables>): Promise<DeleteOneResponse<TData>> {
    return {
      data: await request<TData>(resource, "destroy", {
        method: "POST",
        query: { filterByTk: id },
        meta,
      }),
    };
  },

  async deleteMany<
    TData extends BaseRecord = BaseRecord,
    TVariables = Record<string, unknown>
  >({
    resource,
    ids,
    meta,
  }: DeleteManyParams<TVariables>): Promise<DeleteManyResponse<TData>> {
    const data = await Promise.all(
      ids.map((id) =>
        request<TData>(resource, "destroy", {
          method: "POST",
          query: { filterByTk: id },
          meta,
        })
      )
    );
    return { data };
  },

  getApiUrl: () => nocobaseClient.getApiUrl(),
};

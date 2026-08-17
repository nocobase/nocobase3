export function getDataSourceHeaders(dataSourceKey = "main") {
  return dataSourceKey !== "main"
    ? { "X-Data-Source": dataSourceKey }
    : undefined;
}

export function hasDocumentListFilter(
  query: string,
  status: string,
  sort: string,
  dateFrom = "",
  dateTo = "",
) {
  return (
    Boolean(query) ||
    status !== "all" ||
    sort !== "latest" ||
    Boolean(dateFrom) ||
    Boolean(dateTo)
  );
}

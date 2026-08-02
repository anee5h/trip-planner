export type PaginationItem = number | "ellipsis";

export function getPaginationItems(
  currentPage: number,
  totalPages: number,
): PaginationItem[] {
  const pages: PaginationItem[] = Array.from(
    { length: Math.min(3, totalPages - currentPage + 1) },
    (_, index) => currentPage + index,
  );

  if (totalPages > currentPage + 3) pages.push("ellipsis", totalPages);
  else if (pages.at(-1) !== totalPages) pages.push(totalPages);

  return pages;
}

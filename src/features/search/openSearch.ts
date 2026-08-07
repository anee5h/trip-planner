export const OPEN_SEARCH_EVENT = "meguruto:open-search";

/** Explicit application event for opening the global search dialog. */
export function dispatchOpenSearch() {
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
}

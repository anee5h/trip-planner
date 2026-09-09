export const OPEN_SEARCH_EVENT = "meguruto:open-search";
export const SEARCH_STATE_EVENT = "meguruto:search-state";

/** Explicit application event for opening the global search dialog. */
export function dispatchOpenSearch() {
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
}

/** Publishes whether the shared search dialog is currently open. */
export function dispatchSearchState(isOpen: boolean) {
  window.dispatchEvent(
    new CustomEvent(SEARCH_STATE_EVENT, { detail: { isOpen } }),
  );
}

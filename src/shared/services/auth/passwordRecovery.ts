export interface PasswordRecoveryCallback {
  isRecovery: boolean;
  hasCredentials: boolean;
  errorCode: string | null;
}

type LocationLike = Pick<Location, "origin" | "pathname" | "search" | "hash">;

export function isPasswordRecoveryEvent(event: string): boolean {
  return event === "PASSWORD_RECOVERY";
}

export function inspectRecoveryCallback(
  location: LocationLike | URL,
): PasswordRecoveryCallback {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(location.search);
  const isRecovery =
    hash.get("type") === "recovery" || search.get("type") === "recovery";
  return {
    isRecovery,
    hasCredentials: Boolean(
      hash.get("access_token") && hash.get("refresh_token"),
    ),
    errorCode: isRecovery ? search.get("error_code") : null,
  };
}

export function getPasswordRecoveryRedirectUrl(
  location: LocationLike | URL,
): string {
  const localePrefix =
    location.pathname === "/ja" || location.pathname.startsWith("/ja/")
      ? "/ja"
      : "";
  return `${location.origin}${localePrefix}/reset-password`;
}

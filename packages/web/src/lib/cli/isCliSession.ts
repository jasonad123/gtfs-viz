/**
 * Check if the current page load is a CLI-launched session.
 * Detects CLI params in the URL or a stored CLI profile in sessionStorage.
 * Used by route beforeLoad guards to skip localStorage-based redirects
 * since CLI sessions provide data via the CLI API, not browser import.
 */
export const isCliSession = (): boolean => {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  if (params.has("gtfsSource") && params.has("cliSession") && params.has("cliApi")) {
    return true;
  }

  try {
    const stored = window.sessionStorage.getItem("gtfs_viz_cli_launch_profile");
    return stored !== null;
  } catch {
    return false;
  }
};

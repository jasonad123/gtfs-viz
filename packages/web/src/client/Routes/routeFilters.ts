export const routeNameCandidates = (route: any) => {
  return [route.route_name, route.route_short_name, route.route_long_name]
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
};

export const routeMatchesNameFilter = (route: any, routeName?: string) => {
  const needle = routeName?.trim().toLowerCase();
  if (!needle) return true;
  return routeNameCandidates(route).some((value) => value.toLowerCase().includes(needle));
};

export const buildRouteNameOptions = (routes: any[]) => {
  return Array.from(new Set(routes.flatMap((route) => routeNameCandidates(route))))
    .sort()
    .map((name) => ({ label: name, value: name }));
};

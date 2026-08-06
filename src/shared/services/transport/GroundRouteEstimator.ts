import groundRoutesData from "../../data/ground-routes.json";

export interface GroundRoute {
  from: string;
  to: string;
  bidirectional: boolean;
  mode: "train" | "shinkansen";
  timeRange: [number, number];
  sourceUrl?: string;
  checkedAt?: string;
}

export interface GroundRouteEstimate {
  mode: "train" | "shinkansen";
  timeRange: [number, number];
  sourceUrl?: string;
  checkedAt?: string;
}

// JSON modules are untyped at the import boundary; validate shape once here.
const groundRoutesDataTyped = groundRoutesData as unknown as {
  routes: GroundRoute[];
  municipalityRoutes?: GroundRoute[];
};
const routes: GroundRoute[] = groundRoutesDataTyped.routes;
const municipalityRoutes: GroundRoute[] =
  groundRoutesDataTyped.municipalityRoutes ?? [];

/**
 * Bidirectional ground-route lookup keyed on prefecture pairs. Railway
 * corridors are prefecture-to-prefecture: the topology's transport zones are
 * island-level and cannot distinguish Osaka→Kyoto from Tokyo→Kyoto, so the
 * canonical registry uses the origin/destination prefectures (derived from
 * the confidently resolved origin municipality and the destination's
 * prefecture field).
 */
export function getGroundRoute(
  fromPrefecture: string,
  toPrefecture: string,
  mode: "train" | "shinkansen",
): GroundRouteEstimate | null {
  const match = routes.find(
    (r) =>
      r.mode === mode &&
      ((r.from === fromPrefecture && r.to === toPrefecture) ||
        (r.bidirectional &&
          r.from === toPrefecture &&
          r.to === fromPrefecture)),
  );
  if (!match) return null;
  return {
    mode: match.mode,
    timeRange: match.timeRange,
    sourceUrl: match.sourceUrl,
    checkedAt: match.checkedAt,
  };
}

/**
 * Intra-prefecture (municipality-pair) ground-route lookup, used when the
 * origin and destination share a prefecture: local metro corridors cannot
 * be expressed at prefecture granularity.
 */
export function getMunicipalityGroundRoute(
  fromMunicipalityId: string,
  toMunicipalityId: string,
  mode: "train" | "shinkansen",
): GroundRouteEstimate | null {
  const match = municipalityRoutes.find(
    (r) =>
      r.mode === mode &&
      ((r.from === fromMunicipalityId && r.to === toMunicipalityId) ||
        (r.bidirectional &&
          r.from === toMunicipalityId &&
          r.to === fromMunicipalityId)),
  );
  if (!match) return null;
  return {
    mode: match.mode,
    timeRange: match.timeRange,
    sourceUrl: match.sourceUrl,
    checkedAt: match.checkedAt,
  };
}

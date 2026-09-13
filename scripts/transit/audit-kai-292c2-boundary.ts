#!/usr/bin/env node
/**
 * KAI-292C2 — bounded endpoint crosswalk coverage report.
 *
 * This report counts only explicit crosswalk entries and an explicit audited
 * endpoint set. It never derives mappings from names, coordinates, proximity,
 * parent stations, or route membership.
 */
import crosswalkFile from "../../src/shared/data/scheduled-transit-endpoint-crosswalk.json";
import type {
  ScheduledTransitEndpointKind,
  ScheduledTransitCrosswalkEntry,
} from "../../src/shared/services/transport/static/scheduledTransitEndpoint";

const DATASET_ID = "gtfs-jp-sakata-runrunbus-20260401";
const AUDITED_ENDPOINTS: readonly {
  readonly kind: ScheduledTransitEndpointKind;
  readonly productId: string;
}[] = [
  {
    kind: "origin",
    productId: "kai-292c2-pilot-origin-sakata-100-01",
  },
  {
    kind: "destination",
    productId: "kai-292c2-pilot-destination-sakata-17-01",
  },
  { kind: "destination", productId: "catalogue:yamagata-city" },
  { kind: "origin", productId: "unmapped:current-user-origin" },
];

const mappings = (
  crosswalkFile.mappings as readonly ScheduledTransitCrosswalkEntry[]
).filter((entry) => entry.datasetId === DATASET_ID);
const counts = AUDITED_ENDPOINTS.reduce(
  (result, endpoint) => {
    const matches = mappings.filter(
      (entry) =>
        entry.endpoint.kind === endpoint.kind &&
        entry.endpoint.productId === endpoint.productId,
    );
    if (matches.length === 0) result.unmapped += 1;
    else if (matches.length > 1) result.ambiguous += 1;
    else result.mapped += 1;
    return result;
  },
  { mapped: 0, unmapped: 0, ambiguous: 0 },
);

console.log(
  JSON.stringify(
    {
      status: "audited",
      datasetId: DATASET_ID,
      crosswalkSchemaVersion: crosswalkFile.schemaVersion,
      totalMappings: mappings.length,
      auditedEndpointCount: AUDITED_ENDPOINTS.length,
      ...counts,
      note: "Only explicit productId-to-providerStopId crosswalk entries are counted; unmapped and ambiguous endpoints remain fail-closed.",
    },
    null,
    2,
  ),
);

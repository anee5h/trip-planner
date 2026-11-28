import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderFollowUpMarkdown,
  reverseLedger,
  validateLedger,
} from "../kai-306-destination-sample.mjs";

// KAI-373: "catalogue-maintenance" ledger entries, on synthetic fixtures.

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const pinned = [
  { id: "cohort-a", name: "A" },
  { id: "other-1", reservation: "unverified", notes: "n" },
];
const current = [
  { id: "cohort-a", name: "A" },
  { id: "other-1", reservation: "None required", notes: "n" },
];

type Json = Record<string, any>;

const manifest = (): Json => ({
  sampleIds: ["cohort-a"],
  candidate: { canonicalSha256: sha(stable(pinned)) },
});

const maintenanceEntry = (): Json => ({
  id: "maint-1",
  kind: "catalogue-maintenance",
  sequence: 1,
  date: "2026-11-27",
  sourceCheckedOn: "2026-11-26",
  ticket: "KAI-338",
  title: "Synthetic maintenance",
  rationale: "Reservation text verified against the source.",
  beforeCanonicalSha256: sha(stable(pinned)),
  afterCanonicalSha256: sha(stable(current)),
  records: [
    {
      id: "other-1",
      correctedFields: ["reservation"],
      sources: [
        {
          url: "https://example.com/place",
          checkedOn: "2026-11-26",
          observation: "The page says no booking is needed.",
        },
      ],
      changes: [
        {
          path: ["reservation"],
          beforePresent: true,
          before: "unverified",
          afterPresent: true,
          after: "None required",
        },
      ],
    },
  ],
});

const ledgerOf = (...entries: Json[]): Json => ({
  schemaVersion: 1,
  ticket: "KAI-306",
  entries,
});

describe("KAI-306 ledger: catalogue-maintenance entries", () => {
  it("accepts a maintenance entry for a non-cohort id and reconstructs the pinned hash", () => {
    const ledger = ledgerOf(maintenanceEntry());
    expect(() => validateLedger(ledger, manifest())).not.toThrow();

    const { raw } = reverseLedger(stable(current), ledger, manifest());
    expect(raw).toBe(stable(pinned));
    expect(sha(raw)).toBe(manifest().candidate.canonicalSha256);
  });

  const rejected: Array<[string, (entry: Json) => void, RegExp]> = [
    [
      "a cohort id",
      (entry) => (entry.records[0].id = "cohort-a"),
      /inside the frozen 20-ID cohort/,
    ],
    ["a missing ticket", (entry) => delete entry.ticket, /needs a ticket/],
    [
      "a missing sourceCheckedOn",
      (entry) => delete entry.sourceCheckedOn,
      /invalid check date/,
    ],
    [
      "a missing rationale",
      (entry) => delete entry.rationale,
      /needs a rationale/,
    ],
    [
      "missing correctedFields",
      (entry) => delete entry.records[0].correctedFields,
      /follow-up maint-1: other-1/,
    ],
    [
      "a missing source",
      (entry) => (entry.records[0].sources = []),
      /has no source/,
    ],
    [
      "a non-https source",
      (entry) => (entry.records[0].sources[0].url = "http://example.com/x"),
      /URL/,
    ],
    [
      "a source without an observation",
      (entry) => delete entry.records[0].sources[0].observation,
      /observation/,
    ],
    [
      "a broken hash link",
      (entry) => (entry.beforeCanonicalSha256 = "0".repeat(64)),
      /hash chain broken/,
    ],
    [
      "an audit adjudication field",
      (entry) => (entry.records[0].adjudicatedOutcome = "PASS"),
      /cannot carry audit field adjudicatedOutcome/,
    ],
    [
      "a duplicate record id",
      (entry) => entry.records.push(structuredClone(entry.records[0])),
      /duplicate other-1/,
    ],
    [
      "an unknown kind",
      (entry) => (entry.kind = "whatever"),
      /unknown entry kind/,
    ],
  ];

  it.each(rejected)("rejects %s", (_name, mutate, message) => {
    const entry = maintenanceEntry();
    mutate(entry);
    expect(() => validateLedger(ledgerOf(entry), manifest())).toThrow(message);
  });

  it("still rejects an audit-follow-up entry for a non-cohort id", () => {
    // No `kind` means audit-follow-up: strict cohort rule and audit fields.
    const entry = maintenanceEntry();
    delete entry.kind;
    expect(() => validateLedger(ledgerOf(entry), manifest())).toThrow(
      /outside the frozen 20-ID cohort/,
    );
  });

  it("still fails the live hash check for an unledgered non-cohort edit", () => {
    const ledger = ledgerOf(maintenanceEntry());
    const edited = structuredClone(current);
    edited[1].notes = "changed without a ledger entry";
    expect(() => reverseLedger(stable(edited), ledger, manifest())).toThrow(
      /Current canonical hash is not the last follow-up ledger hash/,
    );
  });

  it("still fails when a ledgered patch value does not match the live file", () => {
    const entry = maintenanceEntry();
    entry.records[0].changes[0].after = "something else";
    expect(() =>
      reverseLedger(stable(current), ledgerOf(entry), manifest()),
    ).toThrow(/value mismatch/);
  });
});

describe("KAI-306 ledger: report rendering", () => {
  const realManifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "qa/kai-306/destination-sample-audit.json"),
      "utf8",
    ),
  );
  const realLedger = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "qa/kai-306/follow-up-ledger.json"),
      "utf8",
    ),
  );

  it("lists maintenance entries in a separate section and leaves earlier output byte-identical", () => {
    const base = renderFollowUpMarkdown(realLedger, realManifest);
    const extended = renderFollowUpMarkdown(
      {
        ...realLedger,
        entries: [
          ...realLedger.entries,
          {
            ...maintenanceEntry(),
            sequence: realLedger.entries.length + 1,
          },
        ],
      },
      realManifest,
    );

    expect(extended.startsWith(base.trimEnd())).toBe(true);
    const section = extended.slice(base.trimEnd().length);
    expect(section).toContain("## Catalogue maintenance");
    expect(section).toContain("other-1");
    expect(section).toContain("KAI-338");
    // No audit outcome arrows ("X → PASS") on maintenance records.
    expect(section).not.toMatch(/→ (PASS|FAIL)/);
  });

  it("does not change the adjudicated gate counts when maintenance entries exist", () => {
    const gate = (markdown: string) =>
      markdown.match(/Public-fact gate:[^\n]*/)?.[0];
    const withMaintenance = renderFollowUpMarkdown(
      {
        ...realLedger,
        entries: [
          ...realLedger.entries,
          { ...maintenanceEntry(), sequence: realLedger.entries.length + 1 },
        ],
      },
      realManifest,
    );
    expect(gate(withMaintenance)).toBe(
      gate(renderFollowUpMarkdown(realLedger, realManifest)),
    );
  });
});

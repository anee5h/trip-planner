import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  GTFS_REQUIRED_FILES,
  GtfsZipError,
  parseGtfsFeed,
  readBoundedGtfsZip,
  type GtfsZipLimits,
} from "../gtfsFeedReader";

const FIXTURE = {
  "agency.txt": "agency_id,agency_name\na1,Alpha\n",
  "stops.txt": "stop_id,stop_name\ns1,Stop\n",
  "routes.txt": "route_id,agency_id,route_type\nr1,a1,3\n",
  "trips.txt": "route_id,service_id,trip_id\nr1,weekday,t1\n",
  "stop_times.txt": "trip_id,stop_id,stop_sequence\nt1,s1,1\n",
};

type ZipEntry = readonly [name: string, content: string];

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value, 0);
  return out;
}

function u32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value >>> 0, 0);
  return out;
}

function makeZip(entries: readonly ZipEntry[]): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const source = Buffer.from(content, "utf8");
    const compressed = deflateRawSync(source);
    const header = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc32(source)),
      u32(compressed.length),
      u32(source.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      compressed,
    ]);
    local.push(header);
    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(8),
        u16(0),
        u16(0),
        u32(crc32(source)),
        u32(compressed.length),
        u32(source.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );
    offset += header.length;
  }
  const localBytes = Buffer.concat(local);
  const centralBytes = Buffer.concat(central);
  return Buffer.concat([
    localBytes,
    centralBytes,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBytes.length),
    u32(localBytes.length),
    u16(0),
  ]);
}

function fixtureZip(
  overrides: Partial<Record<string, string>> = {},
): Uint8Array {
  const files = { ...FIXTURE, ...overrides };
  return makeZip(Object.entries(files));
}

function expectZipError(action: () => unknown, code: string): void {
  expect(action).toThrowError(GtfsZipError);
  try {
    action();
  } catch (error) {
    expect((error as GtfsZipError).code).toBe(code);
  }
}

describe("bounded GTFS ZIP reader", () => {
  it("reads only the allow-listed files and parses quoted/BOM/CRLF CSV", () => {
    const zip = fixtureZip({
      "agency.txt": '\ufeffagency_id,agency_name\r\na1,"Alpha, Transit"\r\n',
      "unrelated.txt": "ignored\n",
    });
    const files = readBoundedGtfsZip(zip);
    expect([...files.keys()]).toEqual(GTFS_REQUIRED_FILES);
    expect(parseGtfsFeed(files).agency).toEqual([
      { agency_id: "a1", agency_name: "Alpha, Transit" },
    ]);
  });

  it("reads optional calendar schedule members without widening the required families", () => {
    const files = readBoundedGtfsZip(
      fixtureZip({
        "calendar.txt":
          "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260401,20260430\n",
        "calendar_dates.txt":
          "service_id,date,exception_type\nweekday,20260402,2\n",
      }),
    );
    const tables = parseGtfsFeed(files);
    expect(tables.calendar).toHaveLength(1);
    expect(tables.calendarDates).toEqual([
      { service_id: "weekday", date: "20260402", exception_type: "2" },
    ]);
  });

  it("reads optional transfer evidence and leaves it absent when the file is absent", () => {
    const withTransfers = parseGtfsFeed(
      readBoundedGtfsZip(
        fixtureZip({
          "transfers.txt":
            "from_stop_id,to_stop_id,transfer_type,min_transfer_time\ns1,s1,2,90\n",
        }),
      ),
    );
    expect(withTransfers.transfers).toEqual([
      {
        from_stop_id: "s1",
        to_stop_id: "s1",
        transfer_type: "2",
        min_transfer_time: "90",
      },
    ]);
    expect(parseGtfsFeed(readBoundedGtfsZip(fixtureZip())).transfers).toBe(
      undefined,
    );
  });

  it("fails when a required file is missing", () => {
    const entries = Object.entries(FIXTURE).filter(
      ([name]) => name !== "agency.txt",
    );
    expectZipError(
      () => readBoundedGtfsZip(makeZip(entries)),
      "missing_required_file",
    );
  });

  it("rejects duplicate filenames", () => {
    expectZipError(
      () =>
        readBoundedGtfsZip(
          makeZip([...Object.entries(FIXTURE), ["agency.txt", "duplicate"]]),
        ),
      "duplicate_filename",
    );
  });

  it.each(["../evil.txt", "..\\evil.txt", "/absolute.txt", "C:\\absolute.txt"])(
    "rejects unsafe archive entry %s",
    (name) => {
      expectZipError(
        () =>
          readBoundedGtfsZip(
            makeZip([[name, "evil"], ...Object.entries(FIXTURE)]),
          ),
        "unsafe_filename",
      );
    },
  );

  it("enforces entry count, per-file, compressed and expanded caps", () => {
    const limits: GtfsZipLimits = {
      maxCompressedBytes: 1000,
      maxExpandedBytes: 100,
      maxFileBytes: 80,
      maxEntries: 5,
    };
    expectZipError(
      () =>
        readBoundedGtfsZip(
          fixtureZip({ "agency.txt": "a".repeat(81) }),
          limits,
        ),
      "file_too_large",
    );
    expectZipError(
      () =>
        readBoundedGtfsZip(fixtureZip({ "agency.txt": "a".repeat(81) }), {
          ...limits,
          maxFileBytes: 1000,
        }),
      "expanded_size_too_large",
    );
    expectZipError(
      () =>
        readBoundedGtfsZip(fixtureZip({ "agency.txt": "a".repeat(10_000) }), {
          ...limits,
          maxFileBytes: 20_000,
          maxExpandedBytes: 20_000,
          maxCompressedBytes: 100,
        }),
      "compressed_size_too_large",
    );
    expectZipError(
      () =>
        readBoundedGtfsZip(
          makeZip([...Object.entries(FIXTURE), ["extra.txt", "x"]]),
          {
            ...limits,
            maxCompressedBytes: 100_000,
            maxExpandedBytes: 100_000,
            maxFileBytes: 100_000,
          },
        ),
      "too_many_entries",
    );
  });

  it("rejects non-ZIP and malformed archives", () => {
    expectZipError(
      () => readBoundedGtfsZip(Buffer.from("not a zip")),
      "not_zip",
    );
    const valid = fixtureZip();
    expectZipError(
      () => readBoundedGtfsZip(valid.slice(0, -3)),
      "malformed_archive",
    );
  });
});

/**
 * KAI-291C1 — bounded, Node-only GTFS ZIP reader and CSV decoder.
 *
 * The reader inspects ZIP central-directory metadata before inflating anything,
 * never extracts to the repository, rejects unsafe names, and returns only the
 * C1 allow-listed tables. It has no network path by design.
 */

import { inflateRawSync } from "node:zlib";
import { isAbsolute } from "node:path";

import { parse } from "csv-parse/sync";

import type {
  GtfsFeedTables,
  GtfsTableRow,
} from "../../src/shared/services/transport/static/gtfsTypes";

export const GTFS_REQUIRED_FILES = [
  "agency.txt",
  "stops.txt",
  "routes.txt",
  "trips.txt",
  "stop_times.txt",
] as const;

const GTFS_OPTIONAL_FILES = ["feed_info.txt", "routes_jp.txt"] as const;
const GTFS_READ_FILES = new Set<string>([
  ...GTFS_REQUIRED_FILES,
  ...GTFS_OPTIONAL_FILES,
]);

export interface GtfsZipLimits {
  readonly maxCompressedBytes: number;
  readonly maxExpandedBytes: number;
  readonly maxFileBytes: number;
  readonly maxEntries: number;
}

export const DEFAULT_GTFS_ZIP_LIMITS: GtfsZipLimits = {
  maxCompressedBytes: 8 * 1024 * 1024,
  maxExpandedBytes: 64 * 1024 * 1024,
  maxFileBytes: 16 * 1024 * 1024,
  maxEntries: 128,
};

export type GtfsZipErrorCode =
  | "not_zip"
  | "malformed_archive"
  | "unsafe_filename"
  | "duplicate_filename"
  | "compressed_size_too_large"
  | "expanded_size_too_large"
  | "file_too_large"
  | "too_many_entries"
  | "unsupported_compression"
  | "encrypted_entry"
  | "checksum_mismatch"
  | "missing_required_file"
  | "malformed_csv";

export class GtfsZipError extends Error {
  readonly code: GtfsZipErrorCode;

  constructor(code: GtfsZipErrorCode, message: string) {
    super(`gtfs-zip[${code}]: ${message}`);
    this.name = "GtfsZipError";
    this.code = code;
  }
}

interface CentralEntry {
  readonly filename: string;
  readonly flags: number;
  readonly method: number;
  readonly compressedSize: number;
  readonly expandedSize: number;
  readonly crc: number;
  readonly localOffset: number;
}

function u16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) {
    throw new GtfsZipError(
      "malformed_archive",
      "truncated 16-bit archive field.",
    );
  }
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new GtfsZipError(
      "malformed_archive",
      "truncated 32-bit archive field.",
    );
  }
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] * 0x1000000)) >>>
    0
  );
}

function signatureAt(
  bytes: Uint8Array,
  offset: number,
  signature: number,
): boolean {
  return (
    offset >= 0 &&
    offset + 4 <= bytes.length &&
    u32(bytes, offset) === signature
  );
}

function decodeUtf8(bytes: Uint8Array, context: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new GtfsZipError(
      "malformed_archive",
      `${context} is not valid UTF-8.`,
    );
  }
}

function validateFilename(filename: string): void {
  const components = filename.split("/");
  if (
    filename.length === 0 ||
    filename.includes("\\") ||
    isAbsolute(filename) ||
    filename.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(filename) ||
    components.includes("..")
  ) {
    throw new GtfsZipError(
      "unsafe_filename",
      `archive entry ${JSON.stringify(filename)} is not a safe relative filename.`,
    );
  }
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimum; offset--) {
    if (!signatureAt(bytes, offset, 0x06054b50)) continue;
    const commentLength = u16(bytes, offset + 20);
    if (offset + 22 + commentLength === bytes.length) return offset;
  }
  throw new GtfsZipError(
    "malformed_archive",
    "end-of-central-directory record is missing or truncated.",
  );
}

function readCentralEntries(
  bytes: Uint8Array,
  limits: GtfsZipLimits,
): {
  readonly entries: readonly CentralEntry[];
  readonly centralOffset: number;
} {
  if (bytes.length < 4 || !signatureAt(bytes, 0, 0x04034b50)) {
    throw new GtfsZipError(
      "not_zip",
      "input does not begin with a ZIP local header.",
    );
  }
  const end = findEndOfCentralDirectory(bytes);
  const disk = u16(bytes, end + 4);
  const centralDisk = u16(bytes, end + 6);
  const entriesOnDisk = u16(bytes, end + 8);
  const totalEntries = u16(bytes, end + 10);
  const centralSize = u32(bytes, end + 12);
  const centralOffset = u32(bytes, end + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new GtfsZipError(
      "malformed_archive",
      "multi-disk ZIP archives are unsupported.",
    );
  }
  if (
    totalEntries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw new GtfsZipError(
      "malformed_archive",
      "ZIP64 archives are unsupported for C1.",
    );
  }
  if (totalEntries > limits.maxEntries) {
    throw new GtfsZipError(
      "too_many_entries",
      `archive contains ${totalEntries} entries; maximum is ${limits.maxEntries}.`,
    );
  }
  if (
    centralOffset > bytes.length ||
    centralSize > bytes.length - centralOffset ||
    centralOffset + centralSize !== end
  ) {
    throw new GtfsZipError(
      "malformed_archive",
      "central directory bounds are invalid.",
    );
  }

  const entries: CentralEntry[] = [];
  const seen = new Set<string>();
  let cursor = centralOffset;
  let expandedTotal = 0;
  for (let index = 0; index < totalEntries; index++) {
    if (!signatureAt(bytes, cursor, 0x02014b50)) {
      throw new GtfsZipError(
        "malformed_archive",
        `central directory entry ${index} has an invalid signature.`,
      );
    }
    const flags = u16(bytes, cursor + 8);
    const method = u16(bytes, cursor + 10);
    const crc = u32(bytes, cursor + 16);
    const compressedSize = u32(bytes, cursor + 20);
    const expandedSize = u32(bytes, cursor + 24);
    const filenameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const entryDisk = u16(bytes, cursor + 34);
    const localOffset = u32(bytes, cursor + 42);
    const headerEnd = cursor + 46;
    const entryEnd = headerEnd + filenameLength + extraLength + commentLength;
    if (entryEnd > end) {
      throw new GtfsZipError(
        "malformed_archive",
        "central directory entry is truncated.",
      );
    }
    if (entryDisk !== 0) {
      throw new GtfsZipError(
        "malformed_archive",
        "multi-disk entry is unsupported.",
      );
    }
    const filename = decodeUtf8(
      bytes.slice(headerEnd, headerEnd + filenameLength),
      `filename for entry ${index}`,
    );
    validateFilename(filename);
    if (seen.has(filename)) {
      throw new GtfsZipError(
        "duplicate_filename",
        `archive contains duplicate filename ${JSON.stringify(filename)}.`,
      );
    }
    seen.add(filename);
    if ((flags & 0x0001) !== 0) {
      throw new GtfsZipError(
        "encrypted_entry",
        `entry ${JSON.stringify(filename)} is encrypted.`,
      );
    }
    if (
      compressedSize > limits.maxFileBytes ||
      expandedSize > limits.maxFileBytes
    ) {
      throw new GtfsZipError(
        "file_too_large",
        `entry ${JSON.stringify(filename)} exceeds the per-file cap.`,
      );
    }
    expandedTotal += expandedSize;
    if (expandedTotal > limits.maxExpandedBytes) {
      throw new GtfsZipError(
        "expanded_size_too_large",
        `archive expansion exceeds ${limits.maxExpandedBytes} bytes.`,
      );
    }
    entries.push({
      filename,
      flags,
      method,
      compressedSize,
      expandedSize,
      crc,
      localOffset,
    });
    cursor = entryEnd;
  }
  if (cursor !== end) {
    throw new GtfsZipError(
      "malformed_archive",
      "central directory has trailing bytes.",
    );
  }
  return { entries, centralOffset };
}

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

function inflateEntry(
  bytes: Uint8Array,
  entry: CentralEntry,
  centralOffset: number,
  limits: GtfsZipLimits,
): Uint8Array {
  const local = entry.localOffset;
  if (!signatureAt(bytes, local, 0x04034b50)) {
    throw new GtfsZipError(
      "malformed_archive",
      `local header for ${entry.filename} is invalid.`,
    );
  }
  const localFlags = u16(bytes, local + 6);
  const localMethod = u16(bytes, local + 8);
  const filenameLength = u16(bytes, local + 26);
  const extraLength = u16(bytes, local + 28);
  const dataStart = local + 30 + filenameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (
    localFlags !== entry.flags ||
    localMethod !== entry.method ||
    dataStart < 0 ||
    dataEnd < dataStart ||
    dataEnd > centralOffset
  ) {
    throw new GtfsZipError(
      "malformed_archive",
      `local header for ${entry.filename} disagrees with the central directory.`,
    );
  }
  const localName = decodeUtf8(
    bytes.slice(local + 30, local + 30 + filenameLength),
    `local filename for ${entry.filename}`,
  );
  if (localName !== entry.filename) {
    throw new GtfsZipError(
      "malformed_archive",
      `local filename for ${entry.filename} disagrees with the central directory.`,
    );
  }
  const compressed = bytes.slice(dataStart, dataEnd);
  let expanded: Uint8Array;
  if (entry.method === 0) {
    expanded = compressed;
  } else if (entry.method === 8) {
    try {
      expanded = inflateRawSync(compressed, {
        maxOutputLength:
          Math.min(limits.maxFileBytes, limits.maxExpandedBytes) + 1,
      });
    } catch {
      throw new GtfsZipError(
        "malformed_archive",
        `entry ${entry.filename} could not be inflated within the cap.`,
      );
    }
  } else {
    throw new GtfsZipError(
      "unsupported_compression",
      `entry ${entry.filename} uses unsupported compression method ${entry.method}.`,
    );
  }
  if (expanded.length !== entry.expandedSize) {
    throw new GtfsZipError(
      "malformed_archive",
      `entry ${entry.filename} has an invalid expanded size.`,
    );
  }
  if (expanded.length > limits.maxFileBytes) {
    throw new GtfsZipError(
      "file_too_large",
      `entry ${entry.filename} exceeds the per-file cap after inflation.`,
    );
  }
  if (crc32(expanded) !== entry.crc) {
    throw new GtfsZipError(
      "checksum_mismatch",
      `entry ${entry.filename} failed its CRC-32 check.`,
    );
  }
  return expanded;
}

function validateLimits(limits: GtfsZipLimits): void {
  if (
    !Number.isSafeInteger(limits.maxCompressedBytes) ||
    !Number.isSafeInteger(limits.maxExpandedBytes) ||
    !Number.isSafeInteger(limits.maxFileBytes) ||
    !Number.isSafeInteger(limits.maxEntries) ||
    limits.maxCompressedBytes < 0 ||
    limits.maxExpandedBytes < 0 ||
    limits.maxFileBytes < 0 ||
    limits.maxEntries < 0
  ) {
    throw new GtfsZipError(
      "malformed_archive",
      "ZIP limits must be non-negative safe integers.",
    );
  }
}

/** Read only safe, allow-listed C1 members from an in-memory ZIP. */
export function readBoundedGtfsZip(
  input: Uint8Array | ArrayBuffer,
  suppliedLimits: GtfsZipLimits = DEFAULT_GTFS_ZIP_LIMITS,
): ReadonlyMap<string, string> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const limits = suppliedLimits;
  validateLimits(limits);
  if (bytes.length > limits.maxCompressedBytes) {
    throw new GtfsZipError(
      "compressed_size_too_large",
      "compressed archive exceeds the cap.",
    );
  }
  const { entries, centralOffset } = readCentralEntries(bytes, limits);
  const files = new Map<string, string>();
  for (const entry of entries) {
    if (!GTFS_READ_FILES.has(entry.filename)) continue;
    const content = inflateEntry(bytes, entry, centralOffset, limits);
    files.set(entry.filename, decodeUtf8(content, entry.filename));
  }
  for (const required of GTFS_REQUIRED_FILES) {
    if (!files.has(required)) {
      throw new GtfsZipError(
        "missing_required_file",
        `required file ${required} is missing.`,
      );
    }
  }
  return files;
}

/** Inspect safe member names without inflating ignored archive members. */
export function listBoundedGtfsZipEntryNames(
  input: Uint8Array | ArrayBuffer,
  suppliedLimits: GtfsZipLimits = DEFAULT_GTFS_ZIP_LIMITS,
): readonly string[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  validateLimits(suppliedLimits);
  if (bytes.length > suppliedLimits.maxCompressedBytes) {
    throw new GtfsZipError(
      "compressed_size_too_large",
      "compressed archive exceeds the cap.",
    );
  }
  return readCentralEntries(bytes, suppliedLimits).entries.map(
    (entry) => entry.filename,
  );
}

function parseCsv(filename: string, text: string): readonly GtfsTableRow[] {
  try {
    const records = parse(text, {
      bom: true,
      columns: false,
      relax_column_count: false,
      relax_quotes: false,
      skip_empty_lines: true,
      trim: false,
    }) as string[][];
    const header = records[0];
    if (
      header === undefined ||
      header.length === 0 ||
      header.some((name) => name.length === 0)
    ) {
      throw new Error("missing or empty header");
    }
    if (new Set(header).size !== header.length)
      throw new Error("duplicate header");
    return records.slice(1).map((record) => {
      const row: Record<string, string> = {};
      for (let index = 0; index < header.length; index++) {
        const key = header[index];
        const value = record[index];
        if (key === undefined || value === undefined)
          throw new Error("short row");
        row[key] = value;
      }
      return row;
    });
  } catch (error) {
    throw new GtfsZipError(
      "malformed_csv",
      `${filename} is not a valid strict CSV table: ${error instanceof Error ? error.message : "parse failure"}.`,
    );
  }
}

/** Decode required/optional C1 tables from the reader's allow-listed files. */
export function parseGtfsFeed(
  files: ReadonlyMap<string, string>,
): GtfsFeedTables {
  const table = (filename: string): readonly GtfsTableRow[] => {
    const text = files.get(filename);
    if (text === undefined) {
      throw new GtfsZipError(
        "missing_required_file",
        `required file ${filename} is missing.`,
      );
    }
    return parseCsv(filename, text);
  };
  return {
    agency: table("agency.txt"),
    stops: table("stops.txt"),
    routes: table("routes.txt"),
    trips: table("trips.txt"),
    stopTimes: table("stop_times.txt"),
    feedInfo: files.has("feed_info.txt")
      ? parseCsv("feed_info.txt", files.get("feed_info.txt") ?? "")
      : undefined,
    routesJp: files.has("routes_jp.txt")
      ? parseCsv("routes_jp.txt", files.get("routes_jp.txt") ?? "")
      : undefined,
  };
}

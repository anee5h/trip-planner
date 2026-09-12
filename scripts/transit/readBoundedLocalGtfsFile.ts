import { closeSync, fstatSync, openSync, readSync } from "node:fs";

import { DEFAULT_GTFS_ZIP_LIMITS, GtfsZipError } from "./gtfsFeedReader";

/** Read one existing local GTFS ZIP without exceeding the reader's input cap. */
export function readBoundedLocalGtfsFile(feedPath: string): Uint8Array {
  const descriptor = openSync(feedPath, "r");
  try {
    const size = fstatSync(descriptor).size;
    if (
      !Number.isSafeInteger(size) ||
      size > DEFAULT_GTFS_ZIP_LIMITS.maxCompressedBytes
    ) {
      throw new GtfsZipError(
        "compressed_size_too_large",
        "local feed is larger than the bounded ZIP input cap.",
      );
    }
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(descriptor, bytes, offset, size - offset, offset);
      if (count === 0) {
        throw new GtfsZipError(
          "malformed_archive",
          "local feed changed while being read.",
        );
      }
      offset += count;
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

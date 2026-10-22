#!/usr/bin/env node
// Prints the field-path patch between two catalogue snapshots for chosen IDs,
// in the shape qa/kai-306/follow-up-ledger.json expects. Objects are descended;
// arrays and scalars are replaced whole. Usage:
//   node scripts/audit/kai-306-follow-up-diff.mjs <before.json> <after.json> <id,id,...>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function diffPaths(before, after, prefix = []) {
  const changes = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const beforePresent = Object.hasOwn(before, key);
    const afterPresent = Object.hasOwn(after, key);
    const path = [...prefix, key];
    if (beforePresent && afterPresent) {
      if (isDeepStrictEqual(before[key], after[key])) continue;
      if (isObject(before[key]) && isObject(after[key])) {
        changes.push(...diffPaths(before[key], after[key], path));
        continue;
      }
    }
    changes.push({
      path,
      beforePresent,
      before: beforePresent ? before[key] : null,
      afterPresent,
      after: afterPresent ? after[key] : null,
    });
  }
  const beforeParentKeys = Object.keys(before);
  const afterParentKeys = Object.keys(after);
  if (!isDeepStrictEqual(beforeParentKeys, afterParentKeys)) {
    const directChange = changes.find(
      (change) =>
        change.path.length === prefix.length + 1 &&
        prefix.every((segment, index) => change.path[index] === segment),
    );
    const orderChange =
      directChange ??
      (beforeParentKeys.length
        ? {
            path: [...prefix, beforeParentKeys[0]],
            beforePresent: true,
            before: before[beforeParentKeys[0]],
            afterPresent: true,
            after: after[beforeParentKeys[0]],
            orderOnly: true,
          }
        : null);
    if (!orderChange) throw new Error("Cannot record empty-object key order");
    if (!directChange) changes.unshift(orderChange);
    orderChange.beforeParentKeys = beforeParentKeys;
    orderChange.afterParentKeys = afterParentKeys;
  }
  return changes;
}

export function diffCatalogues(beforeRows, afterRows, ids) {
  const afterById = new Map(afterRows.map((row) => [row.id, row]));
  const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
  const changedOutsideIds = afterRows
    .filter((row) => !ids.includes(row.id))
    .filter((row) => !isDeepStrictEqual(row, beforeById.get(row.id)))
    .map((row) => row.id);
  if (changedOutsideIds.length || beforeRows.length !== afterRows.length) {
    throw new Error(`Changes outside requested IDs: ${changedOutsideIds}`);
  }
  return ids.map((id) => ({
    id,
    changes: diffPaths(beforeById.get(id), afterById.get(id)),
  }));
}

if (process.argv[1]?.endsWith("kai-306-follow-up-diff.mjs")) {
  const [beforeFile, afterFile, idList] = process.argv.slice(2);
  const read = (file) => JSON.parse(readFileSync(file, "utf8"));
  const ids = idList.split(",");
  const hash = (file) =>
    createHash("sha256").update(readFileSync(file)).digest("hex");
  console.log(
    JSON.stringify(
      {
        beforeCanonicalSha256: hash(beforeFile),
        afterCanonicalSha256: hash(afterFile),
        records: diffCatalogues(read(beforeFile), read(afterFile), ids),
      },
      null,
      2,
    ),
  );
}

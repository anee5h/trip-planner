import { describe, expect, it } from "vitest";

import {
  classifyResponse,
  discoverAssetPath,
  discoverVersionAssetPath,
  extractCommitSha,
} from "../check-security-headers.mjs";

describe("production security smoke response classification", () => {
  it("classifies Cloudflare challenge responses separately from app failures", () => {
    expect(
      classifyResponse({
        status: 403,
        headers: new Headers({
          "cf-mitigated": "challenge",
          server: "cloudflare",
        }),
        body: "<!doctype html><title>Just a moment...</title>",
      }),
    ).toBe("cloudflare-challenge");
  });

  it("does not classify an ordinary application 403 as a challenge", () => {
    expect(
      classifyResponse({
        status: 403,
        headers: new Headers({
          server: "cloudflare",
          "content-type": "application/json",
        }),
        body: '{"error":"forbidden"}',
      }),
    ).toBe("application");
  });
});

describe("deployed asset discovery", () => {
  it("discovers the entry asset from the deployed HTML", () => {
    expect(
      discoverAssetPath(
        '<script type="module" crossorigin src="/assets/index-live123.js">',
      ),
    ).toBe("/assets/index-live123.js");
  });

  it("discovers the deployed version asset from the Vite manifest", () => {
    expect(
      discoverVersionAssetPath({
        "_version-live.js": {
          file: "assets/version-live.js",
          name: "version",
        },
        "index.html": {
          file: "assets/index-live.js",
          name: "index",
        },
      }),
    ).toBe("/assets/version-live.js");
  });

  it("extracts the build commit from the deployed version module", () => {
    expect(
      extractCommitSha(
        'const COMMIT_SHA="e2906391b4400dac755e7b423c254e76d72096f9";',
      ),
    ).toBe("e2906391b4400dac755e7b423c254e76d72096f9");
  });
});

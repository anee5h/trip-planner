/**
 * KAI-291B2 — dump downloader tests (injected fake fetch only).
 *
 * No ODPT internet dependency. The consumer key used throughout is a
 * synthetic TESTKEY value, asserted absent from every URL it must not reach
 * and every serialized error/record.
 */
import { describe, expect, it } from "vitest";

import {
  APPROVED_DUMP_REDIRECT_ORIGINS,
  DUMP_BYTE_CAPS,
  DUMP_DEFAULT_MAX_REDIRECTS,
  DUMP_DEFAULT_TIMEOUT_MS,
  discoverDumpRedirect,
  downloadDumpResource,
  DumpDownloadError,
  type DumpFetch,
  type DumpResponse,
} from "../odptDumpDownload";

const TESTKEY = "TESTKEY-synthetic-123";
const APPROVED = ["https://dump.example"];

interface ScriptStep {
  readonly status: number;
  readonly location?: string;
  readonly contentType?: string;
  readonly contentLength?: string;
  readonly chunks?: string[];
  readonly failWith?: "timeout" | "unreachable" | "truncated";
}

function fakeFetch(
  script: ScriptStep[],
  seen: { urls: string[]; bodiesConsumed: number },
): DumpFetch {
  let step = 0;
  return async (url: string): Promise<DumpResponse> => {
    seen.urls.push(url);
    const current = script[Math.min(step, script.length - 1)];
    step += 1;
    if (current.failWith === "timeout") {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    }
    if (current.failWith === "unreachable") {
      throw new Error("socket hangup");
    }
    const headers = new Map<string, string>();
    if (current.location !== undefined)
      headers.set("location", current.location);
    if (current.contentType !== undefined) {
      headers.set("content-type", current.contentType);
    }
    if (current.contentLength !== undefined) {
      headers.set("content-length", current.contentLength);
    }
    const chunks = (current.chunks ?? []).map((text) =>
      new TextEncoder().encode(text),
    );
    return {
      status: current.status,
      headers: {
        get: (name: string) => headers.get(name.toLowerCase()) ?? null,
      },
      body: (async function* () {
        for (const chunk of chunks) {
          seen.bodiesConsumed += 1;
          yield chunk;
        }
        if (current.failWith === "truncated") {
          throw new Error("stream broke");
        }
      })(),
    };
  };
}

const BASE = {
  rdfType: "odpt:Operator",
  apiKey: TESTKEY,
  approvedRedirectOrigins: APPROVED,
  byteCap: DUMP_BYTE_CAPS["odpt:Operator"],
  timeoutMs: DUMP_DEFAULT_TIMEOUT_MS,
  maxRedirects: DUMP_DEFAULT_MAX_REDIRECTS,
};

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<DumpDownloadError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DumpDownloadError);
    expect((error as DumpDownloadError).code).toBe(code);
    return error as DumpDownloadError;
  }
  throw new Error(`expected DumpDownloadError[${code}] but succeeded`);
}

describe("downloader request gating", () => {
  it("carries exactly the reviewed approved redirect origins", () => {
    // Changing this list is a deliberate reviewed commit, never runtime input.
    expect(APPROVED_DUMP_REDIRECT_ORIGINS).toEqual([
      "https://dataodpt.blob.core.windows.net",
    ]);
  });
  it("rejects a non-allow-listed resource with zero fetch calls", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        rdfType: "odpt:TrainTimetable",
        fetchImpl: fakeFetch([{ status: 200 }], seen),
      }),
      "invalid_rdf_type",
    );
    expect(seen.urls).toEqual([]);
  });

  it("refuses without a credential with zero fetch calls", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        apiKey: "",
        fetchImpl: fakeFetch([{ status: 200 }], seen),
      }),
      "provider_not_configured",
    );
    expect(seen.urls).toEqual([]);
  });
});

describe("downloader redirect policy", () => {
  it("follows a 3xx redirect to an approved origin and records it sanitized", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    const record = await downloadDumpResource({
      ...BASE,
      fetchImpl: fakeFetch(
        [
          {
            status: 301,
            location: "https://dump.example/files/odpt-Operator.json",
          },
          { status: 200, contentType: "application/json", chunks: ["[", "]"] },
        ],
        seen,
      ),
    });
    expect(record.finalStatus).toBe(200);
    expect(record.httpAttempts).toBe(2);
    expect(record.hops).toHaveLength(1);
    expect(record.hops[0]).toEqual({
      status: 301,
      targetOrigin: "https://dump.example",
      targetPath: "/files/odpt-Operator.json",
      hadSensitiveParts: false,
    });
    expect(record.initialEndpoint).toBe(
      "https://api.odpt.org/api/v4/odpt:Operator.json",
    );
    // Key on the initial request only; never forwarded.
    expect(seen.urls[0]).toContain("acl:consumerKey=TESTKEY-synthetic-123");
    expect(seen.urls[1]).toBe("https://dump.example/files/odpt-Operator.json");
    expect(JSON.stringify(record)).not.toContain("TESTKEY");
  });

  it("rejects an HTTP downgrade", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch(
          [{ status: 301, location: "http://dump.example/files/x.json" }],
          seen,
        ),
      }),
      "redirect_downgrade",
    );
  });

  it("rejects redirect userinfo even on the approved origin", async () => {
    for (const location of [
      "https://user:pass@dump.example/file.json",
      "https://user@dump.example/file.json",
      "https://:pass@dump.example/file.json",
    ]) {
      const seen = { urls: [] as string[], bodiesConsumed: 0 };
      const error = await expectCode(
        downloadDumpResource({
          ...BASE,
          fetchImpl: fakeFetch([{ status: 302, location }], seen),
        }),
        "redirect_userinfo_forbidden",
      );
      // The URL is NEVER followed and credentials never reproduced.
      // (Matched against credential shapes, not bare substrings: the error
      // code itself contains the word "userinfo".)
      expect(seen.urls).toHaveLength(1);
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain("user:pass");
      expect(serialized).not.toContain("user@");
      expect(serialized).not.toContain(":pass@");
      expect(serialized).not.toContain("TESTKEY");
    }
  });

  it("rejects an unrelated host", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    const error = await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch(
          [{ status: 301, location: "https://evil.example/dump.json" }],
          seen,
        ),
      }),
      "unapproved_redirect_host",
    );
    expect(JSON.stringify(error)).not.toContain("TESTKEY");
  });

  it("rejects a missing Location", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch([{ status: 302 }], seen),
      }),
      "missing_location",
    );
  });

  it("rejects a malformed Location", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch([{ status: 301, location: "https://" }], seen),
      }),
      "malformed_location",
    );
  });

  it("rejects a redirect loop", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch(
          [
            { status: 301, location: "https://dump.example/a.json" },
            { status: 301, location: "https://dump.example/a.json" },
          ],
          seen,
        ),
      }),
      "redirect_loop",
    );
  });

  it("rejects excessive redirect counts", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        maxRedirects: 1,
        fetchImpl: fakeFetch(
          [
            { status: 301, location: "https://dump.example/a.json" },
            { status: 301, location: "https://dump.example/b.json" },
            { status: 200, contentType: "application/json", chunks: ["[]"] },
          ],
          seen,
        ),
      }),
      "too_many_redirects",
    );
  });

  it("never forwards the key even when the Location carries its own query", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    const record = await downloadDumpResource({
      ...BASE,
      fetchImpl: fakeFetch(
        [
          { status: 301, location: "https://dump.example/f.json?sig=abc" },
          { status: 200, contentType: "application/json", chunks: ["[]"] },
        ],
        seen,
      ),
    });
    expect(seen.urls[1]).not.toContain("TESTKEY");
    expect(record.hops[0].hadSensitiveParts).toBe(true);
    expect(record.hops[0].targetPath).toBeNull();
    expect(JSON.stringify(record)).not.toContain("sig=abc");
  });
});

describe("downloader transport semantics", () => {
  it("downloads a 200 JSON body with hash and byte count", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    const record = await downloadDumpResource({
      ...BASE,
      fetchImpl: fakeFetch(
        [
          {
            status: 200,
            contentType: "application/json",
            chunks: ['[{"a":1}]'],
          },
        ],
        seen,
      ),
    });
    expect(record.bytesDownloaded).toBe(9);
    expect(record.rawSha256).toHaveLength(64);
    expect(record.contentType).toBe("application/json");
    expect(record.httpAttempts).toBe(1);
  });

  it.each([
    [401, "invalid_credential"],
    [403, "forbidden_scope"],
    [404, "dump_unavailable"],
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [503, "provider_unavailable"],
  ])("maps status %i to %s", async (status, code) => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch([{ status }], seen),
      }),
      code,
    );
  });

  it("maps timeouts and unreachable hosts without inventing data", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch([{ status: 200, failWith: "timeout" }], seen),
      }),
      "provider_timeout",
    );
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch([{ status: 200, failWith: "unreachable" }], seen),
      }),
      "provider_unreachable",
    );
  });

  it("rejects before consuming when Content-Length exceeds the cap", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        byteCap: 10,
        fetchImpl: fakeFetch(
          [
            {
              status: 200,
              contentType: "application/json",
              contentLength: "999999",
              chunks: ["[]"],
            },
          ],
          seen,
        ),
      }),
      "response_too_large",
    );
    expect(seen.bodiesConsumed).toBe(0);
  });

  it("aborts a streaming body that crosses the cap", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        byteCap: 4,
        fetchImpl: fakeFetch(
          [
            {
              status: 200,
              contentType: "application/json",
              chunks: ["ab", "cde"],
            },
          ],
          seen,
        ),
      }),
      "response_too_large",
    );
  });

  it("rejects unreviewed and missing Content-Types", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch(
          [
            {
              status: 200,
              contentType: "application/octet-stream",
              chunks: ["[]"],
            },
          ],
          seen,
        ),
      }),
      "unexpected_content_type",
    );
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch([{ status: 200, chunks: ["[]"] }], seen),
      }),
      "unexpected_content_type",
    );
  });

  it("accepts a reviewed Content-Type with parameters", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    const record = await downloadDumpResource({
      ...BASE,
      fetchImpl: fakeFetch(
        [
          {
            status: 200,
            contentType: "application/json; charset=utf-8",
            chunks: ["[]"],
          },
        ],
        seen,
      ),
    });
    expect(record.finalStatus).toBe(200);
    expect(record.contentType).toBe("application/json; charset=utf-8");
  });

  it("enforces declared Content-Length against streamed bytes", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    // Declared 10, downloaded 10: pass.
    const record = await downloadDumpResource({
      ...BASE,
      fetchImpl: fakeFetch(
        [
          {
            status: 200,
            contentType: "application/json",
            contentLength: "10",
            chunks: ["12345", "67890"],
          },
        ],
        seen,
      ),
    });
    expect(record.bytesDownloaded).toBe(10);
    // Declared 10, downloaded 9: reject.
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch(
          [
            {
              status: 200,
              contentType: "application/json",
              contentLength: "10",
              chunks: ["123456789"],
            },
          ],
          seen,
        ),
      }),
      "content_length_mismatch",
    );
    // Declared 9, downloaded 10: reject.
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch(
          [
            {
              status: 200,
              contentType: "application/json",
              contentLength: "9",
              chunks: ["1234567890"],
            },
          ],
          seen,
        ),
      }),
      "content_length_mismatch",
    );
  });

  it("rejects truncated streams and empty bodies", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch(
          [
            {
              status: 200,
              contentType: "application/json",
              chunks: ["[", "truncated"],
              failWith: "truncated",
            },
          ],
          seen,
        ),
      }),
      "truncated_stream",
    );
    const error = await expectCode(
      downloadDumpResource({
        ...BASE,
        fetchImpl: fakeFetch(
          [{ status: 200, contentType: "application/json", chunks: [] }],
          seen,
        ),
      }),
      "empty_body",
    );
    expect(JSON.stringify(error)).not.toContain("TESTKEY");
  });
});

describe("redirect discovery (first contact)", () => {
  it("reports the redirect target with exactly one request, never following", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    const discovery = await discoverDumpRedirect({
      rdfType: "odpt:Operator",
      apiKey: TESTKEY,
      timeoutMs: DUMP_DEFAULT_TIMEOUT_MS,
      fetchImpl: fakeFetch(
        [{ status: 301, location: "https://dump.example/op.json" }],
        seen,
      ),
    });
    expect(seen.urls).toHaveLength(1);
    expect(discovery).toEqual({
      rdfType: "odpt:Operator",
      initialEndpoint: "https://api.odpt.org/api/v4/odpt:Operator.json",
      initialStatus: 301,
      targetOrigin: "https://dump.example",
      targetPath: "/op.json",
      hadSensitiveParts: false,
    });
    expect(JSON.stringify(discovery)).not.toContain("TESTKEY");
  });

  it("refuses discovery without a credential and without any request", async () => {
    const seen = { urls: [] as string[], bodiesConsumed: 0 };
    await expectCode(
      discoverDumpRedirect({
        rdfType: "odpt:Operator",
        apiKey: "",
        timeoutMs: DUMP_DEFAULT_TIMEOUT_MS,
        fetchImpl: fakeFetch([{ status: 301 }], seen),
      }),
      "provider_not_configured",
    );
    expect(seen.urls).toEqual([]);
  });
});

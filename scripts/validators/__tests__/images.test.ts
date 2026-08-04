import { describe, it, expect } from "vitest";
import {
  isPrivateOrReservedAddress,
  ALLOWED_IMAGE_HOSTS,
  classifyImageFailure,
  classifyDnsError,
  followImageResponse,
  type ImageCheckResult,
} from "../images";
import { EventEmitter } from "node:events";

class MockStream extends EventEmitter {
  statusCode = 200;
  headers: { "content-type"?: string } = {};
  destroyed = false;
  destroy() {
    this.destroyed = true;
    this.emit("close");
  }
}

function streamWith(
  chunks: Buffer[],
  mime = "image/jpeg",
): { stream: MockStream; results: ImageCheckResult[] } {
  const stream = new MockStream();
  stream.headers = { "content-type": mime };
  const results: ImageCheckResult[] = [];
  followImageResponse(stream, ["image/jpeg", "image/png"], (r) =>
    results.push(r),
  );
  for (const chunk of chunks) stream.emit("data", chunk);
  return { stream, results };
}

describe("image validator SSRF guards", () => {
  it("rejects private IPv4 ranges", () => {
    expect(isPrivateOrReservedAddress("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedAddress("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedAddress("192.168.1.1")).toBe(true);
    expect(isPrivateOrReservedAddress("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedAddress("172.31.255.255")).toBe(true);
  });

  it("rejects link-local, loopback, and reserved ranges", () => {
    expect(isPrivateOrReservedAddress("169.254.0.1")).toBe(true);
    expect(isPrivateOrReservedAddress("0.0.0.0")).toBe(true);
    expect(isPrivateOrReservedAddress("100.64.0.1")).toBe(true);
    expect(isPrivateOrReservedAddress("224.0.0.1")).toBe(true);
    expect(isPrivateOrReservedAddress("255.255.255.255")).toBe(true);
  });

  it("rejects private IPv6 prefixes", () => {
    expect(isPrivateOrReservedAddress("::1")).toBe(true);
    expect(isPrivateOrReservedAddress("::")).toBe(true);
    expect(isPrivateOrReservedAddress("fe80::1")).toBe(true);
    expect(isPrivateOrReservedAddress("fd00::1")).toBe(true);
    expect(isPrivateOrReservedAddress("fc00::1")).toBe(true);
  });

  it("accepts public IPv4 addresses", () => {
    expect(isPrivateOrReservedAddress("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedAddress("208.80.154.224")).toBe(false);
    expect(isPrivateOrReservedAddress("185.15.59.0")).toBe(false);
  });

  it("allows only the curated image hosts", () => {
    expect(ALLOWED_IMAGE_HOSTS.has("upload.wikimedia.org")).toBe(true);
    expect(ALLOWED_IMAGE_HOSTS.has("commons.wikimedia.org")).toBe(true);
    expect(ALLOWED_IMAGE_HOSTS.has("images.unsplash.com")).toBe(true);
    expect(ALLOWED_IMAGE_HOSTS.has("localhost")).toBe(false);
    expect(ALLOWED_IMAGE_HOSTS.has("169.254.169.254")).toBe(false);
    expect(ALLOWED_IMAGE_HOSTS.has("example.com")).toBe(false);
  });
});

describe("classifyImageFailure", () => {
  it("classifies policy violations as errors", () => {
    expect(classifyImageFailure("policy")).toEqual({
      severity: "error",
      code: "IMAGE_POLICY_VIOLATION",
    });
  });

  it("classifies hard HTTP failures (404/410/500) as errors", () => {
    expect(classifyImageFailure(undefined, 404)).toEqual({
      severity: "error",
      code: "BROKEN_IMAGE_URL",
    });
    expect(classifyImageFailure(undefined, 410)).toEqual({
      severity: "error",
      code: "BROKEN_IMAGE_URL",
    });
    expect(classifyImageFailure(undefined, 500)).toEqual({
      severity: "error",
      code: "BROKEN_IMAGE_URL",
    });
  });

  it("classifies transient failures (429/503) as warnings", () => {
    expect(classifyImageFailure(undefined, 429)).toEqual({
      severity: "warning",
      code: "IMAGE_FETCH_WARNING",
    });
    expect(classifyImageFailure(undefined, 503)).toEqual({
      severity: "warning",
      code: "IMAGE_FETCH_WARNING",
    });
    expect(classifyImageFailure("transient")).toEqual({
      severity: "warning",
      code: "IMAGE_FETCH_WARNING",
    });
  });

  it("classifies other HTTP statuses as warnings", () => {
    expect(classifyImageFailure(undefined, 403)).toEqual({
      severity: "warning",
      code: "IMAGE_FETCH_WARNING",
    });
    expect(classifyImageFailure(undefined, 200)).toEqual({
      severity: "warning",
      code: "IMAGE_FETCH_WARNING",
    });
  });
});

describe("classifyDnsError", () => {
  it("classifies temporary resolver failures as transient", () => {
    expect(classifyDnsError("EAI_AGAIN")).toBe("transient");
    expect(classifyDnsError("ENETUNREACH")).toBe("transient");
    expect(classifyDnsError("ETIMEDOUT")).toBe("transient");
  });

  it("classifies definitive resolution failures as hard", () => {
    expect(classifyDnsError("ENOTFOUND")).toBe("hard");
    expect(classifyDnsError("EAI_NONAME")).toBe("hard");
    expect(classifyDnsError(undefined)).toBe("hard");
  });
});

describe("followImageResponse", () => {
  it("resolves exactly once with a policy failure when the body exceeds the cap and the stream closes without end", () => {
    // Emit enough data to cross the 20 MB cap, then destroy (emits close,
    // no end event). The settle guard must produce a single policy result.
    const big = Buffer.alloc(5 * 1024 * 1024); // 5 MB per chunk
    const { stream, results } = streamWith([big, big, big, big, big]);
    stream.destroy();
    stream.emit("end"); // must be ignored (already settled)

    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].failureType).toBe("policy");
    expect(results[0].error).toContain("byte cap");
  });

  it("resolves with ok on a small valid image", () => {
    const stream = new MockStream();
    stream.headers = { "content-type": "image/jpeg" };
    const results: ImageCheckResult[] = [];
    followImageResponse(stream, ["image/jpeg"], (r) => results.push(r));
    stream.emit("data", Buffer.from("jpgdata"));
    stream.emit("end");
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
  });

  it("rejects a non-image content type as a policy failure", () => {
    const stream = new MockStream();
    stream.headers = { "content-type": "text/html" };
    const results: ImageCheckResult[] = [];
    followImageResponse(stream, ["image/jpeg"], (r) => results.push(r));
    stream.emit("data", Buffer.from("<html>"));
    stream.emit("end");
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].failureType).toBe("policy");
    expect(results[0].error).toContain("Content-Type");
  });
});

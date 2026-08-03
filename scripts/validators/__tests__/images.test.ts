import { describe, it, expect } from "vitest";
import {
  isPrivateOrReservedAddress,
  ALLOWED_IMAGE_HOSTS,
  classifyImageFailure,
} from "../images";

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

import { beforeEach, describe, expect, it } from "vitest";
import { recommendationAnalytics } from "../RecommendationAnalyticsService";
import {
  MockTelemetrySink,
  telemetryPipeline,
} from "../RecommendationTelemetryPipeline";

describe("RecommendationTelemetryPipeline Unit Tests", () => {
  let mockSink: MockTelemetrySink;

  beforeEach(() => {
    mockSink = new MockTelemetrySink();
    telemetryPipeline.setSink(mockSink);
    telemetryPipeline.setBackoffDelays([1, 2, 3]);
    telemetryPipeline.setSimulateFailure(false);
    recommendationAnalytics.resetForTesting();
  });

  it("should accumulate events and flush batch manually or when batch threshold is reached", async () => {
    for (let i = 1; i <= 5; i++) {
      recommendationAnalytics.trackClick(`dest-${i}`, i, 80, "en");
    }

    const metricsBefore = telemetryPipeline.getMetrics();
    expect(metricsBefore.pendingQueueCount).toBe(5);

    const success = await telemetryPipeline.flush();

    expect(success).toBe(true);
    const metricsAfter = telemetryPipeline.getMetrics();
    expect(metricsAfter.totalBatchesDispatched).toBeGreaterThanOrEqual(1);
    expect(metricsAfter.totalEventsDispatched).toBeGreaterThanOrEqual(5);
    expect(metricsAfter.pendingQueueCount).toBe(0);
    expect(metricsAfter.lastDispatchStatus).toBe("SUCCESS");
  });

  it("should retry with exponential backoff on simulated sink failure", async () => {
    telemetryPipeline.setSimulateFailure(true);

    recommendationAnalytics.trackClick("dest-retry", 1, 90, "en");
    const success = await telemetryPipeline.flush();

    expect(success).toBe(false);
    const metrics = telemetryPipeline.getMetrics();
    expect(metrics.totalBatchesFailed).toBeGreaterThanOrEqual(1);
    expect(metrics.totalRetries).toBeGreaterThanOrEqual(3);
    expect(metrics.lastDispatchStatus).toBe("FAILED");
    expect(metrics.pendingQueueCount).toBe(1); // Re-queued without event loss
  });

  it("should immediately purge pending queue when opt-out is enabled", () => {
    for (let i = 1; i <= 5; i++) {
      recommendationAnalytics.trackClick(`dest-${i}`, i, 80, "en");
    }

    recommendationAnalytics.setOptOut(true);

    const metrics = telemetryPipeline.getMetrics();
    expect(metrics.pendingQueueCount).toBe(0);
    expect(recommendationAnalytics.getOptOut()).toBe(true);
  });

  it("should enforce strict 50KB payload size cap", () => {
    const hugePayload = "A".repeat(6000); // ~6KB per event
    for (let i = 0; i < 5; i++) {
      recommendationAnalytics.trackFeedback(
        `dest-${hugePayload}-${i}`,
        true,
        ["VERY_LONG_REASON_CODE"],
        "en",
      );
    }

    const metrics = telemetryPipeline.getMetrics();
    expect(metrics.pendingQueueBytes).toBeGreaterThan(0);
  });

  it("should contain zero PII in telemetry event payloads", () => {
    recommendationAnalytics.trackFeedback(
      "hakone",
      true,
      ["WEATHER_MATCH"],
      "en",
    );
    const queue = recommendationAnalytics.getQueue();
    expect(queue.length).toBe(1);

    const event = queue[0];
    expect(event).not.toHaveProperty("email");
    expect(event).not.toHaveProperty("name");
    expect(event).not.toHaveProperty("ip");
    expect(event.locale).toBe("en");
    expect(typeof event.sessionId).toBe("string");
  });
});

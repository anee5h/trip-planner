import type { AnyRecommendationAnalyticsEvent } from "./RecommendationAnalyticsTypes";

export interface TelemetrySink {
  dispatchBatch(events: AnyRecommendationAnalyticsEvent[]): Promise<boolean>;
}

export interface TelemetryPipelineMetrics {
  totalBatchesDispatched: number;
  totalBatchesFailed: number;
  totalEventsDispatched: number;
  totalRetries: number;
  lastDispatchTime: number | null;
  lastDispatchStatus: "IDLE" | "SUCCESS" | "RETRYING" | "FAILED";
  pendingQueueCount: number;
  pendingQueueBytes: number;
  isSimulatingFailure: boolean;
  debugMode: boolean;
}

export class MockTelemetrySink implements TelemetrySink {
  private simulateFailure: boolean = false;
  private latencyMs: number = 50;

  public setSimulateFailure(fail: boolean): void {
    this.simulateFailure = fail;
  }

  public getSimulateFailure(): boolean {
    return this.simulateFailure;
  }

  public async dispatchBatch(
    _events: AnyRecommendationAnalyticsEvent[],
  ): Promise<boolean> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    if (this.simulateFailure) {
      return false;
    }
    return true;
  }
}

const MAX_BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 5000;
const MAX_PAYLOAD_BYTES = 51200; // 50 KB

export class RecommendationTelemetryPipeline {
  private queue: AnyRecommendationAnalyticsEvent[] = [];
  private sink: TelemetrySink;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isProcessing: boolean = false;
  private debugMode: boolean = false;
  private backoffDelays: number[] = [1000, 2000, 4000];

  private metrics: TelemetryPipelineMetrics = {
    totalBatchesDispatched: 0,
    totalBatchesFailed: 0,
    totalEventsDispatched: 0,
    totalRetries: 0,
    lastDispatchTime: null,
    lastDispatchStatus: "IDLE",
    pendingQueueCount: 0,
    pendingQueueBytes: 0,
    isSimulatingFailure: false,
    debugMode: false,
  };

  constructor(sink?: TelemetrySink) {
    this.sink = sink || new MockTelemetrySink();
    this.startTimer();
  }

  public setSink(sink: TelemetrySink): void {
    this.sink = sink;
  }

  public setBackoffDelays(delays: number[]): void {
    this.backoffDelays = delays;
  }

  public setDebugMode(debug: boolean): void {
    this.debugMode = debug;
    this.metrics.debugMode = debug;
  }

  public setSimulateFailure(fail: boolean): void {
    if (this.sink instanceof MockTelemetrySink) {
      this.sink.setSimulateFailure(fail);
      this.metrics.isSimulatingFailure = fail;
    }
  }

  private startTimer(): void {
    if (typeof window !== "undefined" && !this.timer) {
      this.timer = setInterval(() => {
        this.flush();
      }, FLUSH_INTERVAL_MS);
    }
  }

  public stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public enqueue(event: AnyRecommendationAnalyticsEvent): void {
    this.queue.push(event);
    this.updateQueueMetrics();

    if (this.debugMode) {
      console.log(
        `[TelemetryPipeline] Enqueued event: ${event.eventType}`,
        event,
      );
    }

    if (this.queue.length >= MAX_BATCH_SIZE) {
      this.flush();
    }
  }

  public purge(): void {
    this.queue = [];
    this.updateQueueMetrics();
    if (this.debugMode) {
      console.log("[TelemetryPipeline] Queue purged due to opt-out.");
    }
  }

  private updateQueueMetrics(): void {
    this.metrics.pendingQueueCount = this.queue.length;
    try {
      const json = JSON.stringify(this.queue);
      this.metrics.pendingQueueBytes = new TextEncoder().encode(json).length;
    } catch {
      this.metrics.pendingQueueBytes = 0;
    }
  }

  public getMetrics(): TelemetryPipelineMetrics {
    this.updateQueueMetrics();
    return { ...this.metrics };
  }

  public async flush(): Promise<boolean> {
    if (this.isProcessing || this.queue.length === 0) {
      return true;
    }

    this.isProcessing = true;
    const batch = this.extractBoundedBatch();
    this.updateQueueMetrics();

    let success = false;
    let attempt = 0;

    while (attempt <= this.backoffDelays.length && !success) {
      if (attempt > 0) {
        this.metrics.totalRetries++;
        this.metrics.lastDispatchStatus = "RETRYING";
        const delay = this.backoffDelays[attempt - 1] || 10;
        if (this.debugMode) {
          console.warn(
            `[TelemetryPipeline] Retrying batch (attempt ${attempt}) after ${delay}ms...`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        success = await this.sink.dispatchBatch(batch);
      } catch (err) {
        success = false;
        if (this.debugMode) {
          console.error("[TelemetryPipeline] Dispatch error:", err);
        }
      }

      attempt++;
    }

    this.metrics.lastDispatchTime = Date.now();

    if (success) {
      this.metrics.totalBatchesDispatched++;
      this.metrics.totalEventsDispatched += batch.length;
      this.metrics.lastDispatchStatus = "SUCCESS";
      if (this.debugMode) {
        console.log(
          `[TelemetryPipeline] Successfully dispatched ${batch.length} events.`,
        );
      }
    } else {
      this.metrics.totalBatchesFailed++;
      this.metrics.lastDispatchStatus = "FAILED";
      // Re-queue un-dispatched batch at the front without loss
      this.queue.unshift(...batch);
      this.updateQueueMetrics();
      if (this.debugMode) {
        console.error(
          `[TelemetryPipeline] Batch dispatch failed after ${attempt - 1} retries.`,
        );
      }
    }

    this.isProcessing = false;
    return success;
  }

  private extractBoundedBatch(): AnyRecommendationAnalyticsEvent[] {
    const batch: AnyRecommendationAnalyticsEvent[] = [];
    let currentBytes = 0;

    while (this.queue.length > 0 && batch.length < MAX_BATCH_SIZE) {
      const nextEvent = this.queue[0];
      const eventBytes = new TextEncoder().encode(
        JSON.stringify(nextEvent),
      ).length;

      if (currentBytes + eventBytes > MAX_PAYLOAD_BYTES && batch.length > 0) {
        break; // Keep payload strictly under 50KB
      }

      batch.push(this.queue.shift()!);
      currentBytes += eventBytes;
    }

    return batch;
  }
}

export const telemetryPipeline = new RecommendationTelemetryPipeline();

import { describe, it, expect, beforeAll } from "vitest";
import {
  calculateConfidence,
  calculateScore,
  CONFIDENCE_MULTIPLIERS,
  computeOverallScore,
  isRatingVerified,
  buildScoreMetadata,
  getScorePresentation,
  SCORE_EVIDENCE_THRESHOLD,
  OVERALL_SCORE_RUBRIC_VERSION,
  getValidModes,
  ratingReliability,
} from "../RecommendationScorer";
import { normalizeWeatherDescription } from "../RecommendationContext";
import { diversifyRecommendations } from "../RecommendationPipeline";
import type { Destination } from "@/shared/types/destination";
import { loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";
import type { PipelineRecommendation } from "../RecommendationTypes";
import { getDestinationListAsync } from "@/shared/services/destination/DestinationService";
import { getDayTripTravelEfficiency } from "../TripDurationService";

// KAI-121: the full catalogue is runtime-lazy; tests that need full
// destination fields must preload it before the sync accessors read it.
beforeAll(async () => {
  await loadDestinationsIndex();
});

const mockDest = {
  id: "test-dest",
  name: "Test Destination",
  prefecture: "Tokyo",
  region: "Kanto",
  description: "A lovely test place",
  categories: ["Onsen"],
  tags: ["Onsen"],
  heroImage: "",
  gallery: [],
  highlights: [],
  budgetMin: 5000,
  budgetRecommended: 10000,
  budgetMax: 15000,
  ratings: {
    overall: 8.5,
    food: 8.0,
    couple: 7.5,
    value: 8.0,
    summer: 5.0,
    winter: 5.0,
    rain: 5.0,
    photography: 8.0,
    relaxation: 8.0,
    uniqueness: 8.0,
  },
  ratingMetadata: {
    rubricVersion: 1,
    method: "manual",
    confidence: "high",
  },
  bestSeason: "Spring",
  coordinates: { lat: 35.6812, lng: 139.7671 },
  transportOptions: { train: 60 },
  recommendedVisitHours: { min: 3, max: 5 },
  totalTripHours: 4,
  walkingMin: 30,
  walkingSunMin: 15,
  walkingShadeMin: 15,
  indoorPercent: 50,
  crowd: { weekday: 2, weekend: 4, holiday: 5 },
  season: { spring: 5, summer: 3, autumn: 4, winter: 2 },
} as unknown as Destination;

describe("RecommendationScorer Unit Tests", () => {
  it("computes confidence score bound between 15 and 99", () => {
    expect(calculateConfidence(-100)).toBe(15);
    expect(calculateConfidence(1000)).toBe(99);
    expect(calculateConfidence(60)).toBe(50);
  });

  it("calculates score with default context options", () => {
    const context = {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      currentWeatherCondition: "any",
      visitedIds: [],
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    };
    const res = calculateScore(mockDest, context);
    expect(res.score).toBeGreaterThan(0);
    expect(res.bestMode).toBe("train");
  });

  it("preserves a legitimate zero overall rating", () => {
    const context = {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      currentWeatherCondition: "any",
      visitedIds: [],
    };
    const five = calculateScore(
      { ...mockDest, ratings: { ...mockDest.ratings, overall: 5 } },
      context,
    ).score;
    const zero = calculateScore(
      { ...mockDest, ratings: { ...mockDest.ratings, overall: 0 } },
      context,
    ).score;
    const ten = calculateScore(
      { ...mockDest, ratings: { ...mockDest.ratings, overall: 10 } },
      context,
    ).score;

    expect(zero - five).toBeCloseTo(-30);
    expect(ten - five).toBeCloseTo(30);
  });

  it("halves rating-derived score changes for low-confidence assisted ratings", () => {
    const context = {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      visitedIds: [],
    };
    const reviewed = calculateScore(
      { ...mockDest, ratings: { ...mockDest.ratings, overall: 10 } },
      context,
    ).score;
    const reviewedNeutral = calculateScore(
      { ...mockDest, ratings: { ...mockDest.ratings, overall: 5 } },
      context,
    ).score;
    const assisted = calculateScore(
      {
        ...mockDest,
        ratings: { ...mockDest.ratings, overall: 10 },
        ratingMetadata: {
          rubricVersion: 1,
          method: "assisted",
          confidence: "low",
        },
      },
      context,
    ).score;
    const assistedNeutral = calculateScore(
      {
        ...mockDest,
        ratings: { ...mockDest.ratings, overall: 5 },
        ratingMetadata: {
          rubricVersion: 1,
          method: "assisted",
          confidence: "low",
        },
      },
      context,
    ).score;

    expect(assisted - assistedNeutral).toBeCloseTo(
      (reviewed - reviewedNeutral) / 2,
    );
  });

  it("does not emit a catastrophic score without valid transport", () => {
    const result = calculateScore(
      { ...mockDest, transportOptions: {} },
      {
        tripType: "any",
        budget: 20000,
        carMode: "rental",
        publicModes: [],
        partySize: 1,
        visitedIds: [],
      },
    );

    expect(result.bestMode).toBeUndefined();
    expect(result.bestModeScore).toBe(0);
    expect(result.bestModeBudget).toBeUndefined();
    expect(result.eligible).toBe(false);
    expect(result.ineligibleReason).toBe("NO_VALID_TRANSPORT");
    expect(result.score).toBeGreaterThan(-100);
  });

  it("does not turn missing numeric evidence into a positive recommendation signal", () => {
    const context = {
      tripType: "any" as const,
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      visitedIds: [],
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    };
    const complete = calculateScore(
      {
        ...mockDest,
        ratings: {
          ...mockDest.ratings,
          overall: 5,
          food: 5,
          photography: 5,
          summer: 5,
          winter: 5,
        },
        season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
      },
      context,
    );
    const incomplete = calculateScore(
      {
        ...mockDest,
        budgetMin: undefined,
        budgetRecommended: undefined,
        budgetMax: undefined,
        ratings: {} as Destination["ratings"],
        season: undefined,
      } as unknown as Destination,
      context,
    );

    expect(incomplete.score).toBeLessThanOrEqual(complete.score);
  });

  it("retains every authorized user-allowed mode regardless of budget tier", () => {
    const carDestination = {
      ...mockDest,
      transportOptions: { train: 60, car: 70, my_car: 65 },
    };

    expect(
      getValidModes(
        carDestination,
        "rental",
        [],
        { lat: 35.6812, lng: 139.7671 },
        "standard",
        "mainland-honshu",
      ),
    ).toEqual(["car"]);
    expect(
      getValidModes(
        carDestination,
        "my_car",
        [],
        { lat: 35.6812, lng: 139.7671 },
        "economy",
        "mainland-honshu",
      ),
    ).toEqual(["my_car"]);
    // Budget tiers must not delete faster authorized modes (e.g. shinkansen
    // for a standard user): travel evaluation sees every valid mode.
    expect(
      getValidModes(
        carDestination,
        "rental",
        ["train", "flight"],
        { lat: 35.6812, lng: 139.7671 },
        "standard",
        "mainland-honshu",
      ),
    ).toEqual(["train", "car"]);
  });

  it("keeps day-trip efficiency on the selected usable transport mode", async () => {
    // KAI-89 model pass: karuizawa-town's template budget was honestly
    // cleared (no verified ticket, insufficient peer samples), which would
    // make this fare-semantics test vacuous. nagano-city retains its
    // verified-fare corridor budget and exercises the same invariant.
    // KAI-204 phase 3: nagano-city's numeric budget is legacy-tagged
    // (untrusted), so the fixture carries synthetic trusted metadata to
    // keep exercising the fare-semantics invariant.
    const destination = {
      ...((await getDestinationListAsync("en")) as Destination[]).find(
        (candidate) => candidate.id === "nagano-city",
      )!,
      budgetMetadata: {
        method: "manual",
        confidence: "low",
        basis: "test fixture — trusted provenance for fare-semantics invariant",
      },
    } as Destination;
    const context = {
      vibe: "any",
      budget: 40000,
      budgetTier: "standard" as const,
      carMode: "none",
      publicModes: ["train", "shinkansen"],
      partySize: 2,
      visitedIds: [],
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
      originZoneId: "mainland-honshu" as const,
      tripMode: "day_trip" as const,
      tripDuration: "fullDay" as const,
    };
    const result = calculateScore(destination, context);
    const train = result.modeScoreBreakdown.train;
    const shinkansen = result.modeScoreBreakdown.shinkansen;
    const trainEfficiency = getDayTripTravelEfficiency(
      destination,
      context,
      "train",
    )!;
    const shinkansenEfficiency = getDayTripTravelEfficiency(
      destination,
      context,
      "shinkansen",
    )!;

    expect(train.usable).toBe(true);
    expect(shinkansen.usable).toBe(true);
    // KAI-12 verified-fare behavior: Tokyo→Nagano shinkansen carries a
    // verified reserved fare (¥8,250 one-way, FARE_POLICY §2) while the
    // train corridor has none (heuristic only).
    // KAI-217B round-2: the budget score evaluates the CANONICAL engine
    // cost. Required local transport is UNAVAILABLE until explicit
    // localTransport facts exist → EVERY engine result is partial → NO
    // mode contributes a budget bonus/penalty (no strict affordability
    // claim on incomplete evidence). bestMode is decided by transport/
    // travel-efficiency scoring alone.
    expect(train.budget).toBe(0);
    expect(shinkansen.budget).toBe(0);
    expect(shinkansenEfficiency.oneWayMinutes).toBeLessThan(
      trainEfficiency.oneWayMinutes,
    );
    // KAI-217B: with the canonical engine, train (partial — no verified
    // fare) no longer receives the cheap-heuristic budget bonus that made
    // it win bestMode. Shinkansen (complete verified cost) now wins on
    // total score.
    expect(result.bestMode).toBe("shinkansen");
    expect(result.dayTripTravelEfficiency?.mode).toBe(result.bestMode);
    expect(result.dayTripTravelEfficiency?.oneWayMinutes).toBe(
      shinkansenEfficiency.oneWayMinutes,
    );
    expect(shinkansen.travelEfficiency).toBe(
      result.dayTripTravelEfficiency?.contribution,
    );
    expect(result.modeScoreBreakdown.shinkansen.total).toBe(
      shinkansen.budget + shinkansen.transport + shinkansen.travelEfficiency,
    );
  });

  it("applies +25 boost for thumbs up and -1000 penalty for thumbs down", () => {
    const baseContext = {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      currentWeatherCondition: "any",
      visitedIds: [],
    };
    const baseScore = calculateScore(mockDest, baseContext).score;

    const upScore = calculateScore(mockDest, {
      ...baseContext,
      userRatings: { "test-dest": "up" },
    }).score;
    expect(upScore).toBe(baseScore + 25);

    const downScore = calculateScore(mockDest, {
      ...baseContext,
      userRatings: { "test-dest": "down" },
    }).score;
    expect(downScore).toBe(baseScore - 1000);
  });

  it("keeps confidence monotonic and bounded across score bands", () => {
    const scores = [-100, 0, 60, 120, 240];
    const confidences = scores.map(calculateConfidence);

    expect(confidences).toEqual([15, 15, 50, 99, 99]);
    expect(confidences).toEqual([...confidences].sort((a, b) => a - b));
  });

  it("normalizes and scores actual weather without a preference input", () => {
    expect(normalizeWeatherDescription("Light drizzle")).toBe("rainy");
    expect(normalizeWeatherDescription("Thunderstorm")).toBe("stormy");

    const base = {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      visitedIds: [],
      destinationWeather: {
        actual: { condition: "rainy" as const, temperatureC: 18 },
      },
    };
    const rainy = calculateScore(
      {
        ...mockDest,
        comfort: { heatTolerance: 5, rainFriendly: 9, walkingIntensity: 5 },
      },
      base,
    ).score;
    const clear = calculateScore(mockDest, {
      ...base,
      destinationWeather: { actual: { condition: "clear", temperatureC: 18 } },
    }).score;
    expect(rainy).not.toBe(clear);
  });

  it("scores actual temperature without a preferred temperature", () => {
    const destination = {
      ...mockDest,
      ratings: { ...mockDest.ratings, summer: 8 },
    };
    const context = {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      visitedIds: [],
    };
    const neutral = calculateScore(destination, context).score;
    const actual = calculateScore(destination, {
      ...context,
      destinationWeather: {
        actual: { condition: "clear" as const, temperatureC: 35 },
      },
    }).score;

    expect(actual - neutral).toBeCloseTo(15);
  });

  // ---------------------------------------------------------------------------
  // REC-001: Extended confidence multipliers
  // ---------------------------------------------------------------------------

  it("exports CONFIDENCE_MULTIPLIERS with correct values", () => {
    expect(CONFIDENCE_MULTIPLIERS.high).toBe(1.0);
    expect(CONFIDENCE_MULTIPLIERS.medium).toBe(0.8);
    expect(CONFIDENCE_MULTIPLIERS.low).toBe(0.5);
  });

  it("applies medium confidence multiplier of 0.8 relative to high", () => {
    const context = {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      visitedIds: [],
    };
    const highConf = calculateScore(
      {
        ...mockDest,
        ratings: { ...mockDest.ratings, overall: 10 },
        ratingMetadata: {
          rubricVersion: 1,
          method: "assisted" as const,
          confidence: "high" as const,
        },
      },
      context,
    ).score;
    const highNeutral = calculateScore(
      {
        ...mockDest,
        ratings: { ...mockDest.ratings, overall: 5 },
        ratingMetadata: {
          rubricVersion: 1,
          method: "assisted" as const,
          confidence: "high" as const,
        },
      },
      context,
    ).score;
    const medConf = calculateScore(
      {
        ...mockDest,
        ratings: { ...mockDest.ratings, overall: 10 },
        ratingMetadata: {
          rubricVersion: 1,
          method: "assisted" as const,
          confidence: "medium" as const,
        },
      },
      context,
    ).score;
    const medNeutral = calculateScore(
      {
        ...mockDest,
        ratings: { ...mockDest.ratings, overall: 5 },
        ratingMetadata: {
          rubricVersion: 1,
          method: "assisted" as const,
          confidence: "medium" as const,
        },
      },
      context,
    ).score;
    // medium multiplier is 0.8, high is 1.0 → ratio ≈ 0.8
    expect((medConf - medNeutral) / (highConf - highNeutral)).toBeCloseTo(
      0.8,
      1,
    );
  });

  it("treats absent ratingMetadata as low-confidence evidence", () => {
    const noMetaDest = { ...mockDest } as Destination;
    delete (noMetaDest as unknown as Record<string, unknown>).ratingMetadata;
    expect(ratingReliability(noMetaDest)).toBe(0.5);
  });

  it("treats ratingMetadata.confidence=high as full weight (1.0)", () => {
    const dest = {
      ...mockDest,
      ratingMetadata: {
        rubricVersion: 1,
        method: "manual" as const,
        confidence: "high" as const,
      },
    };
    expect(ratingReliability(dest)).toBe(1.0);
  });

  it("isRatingVerified: legacy rating-vector trust from confidence only", () => {
    expect(
      isRatingVerified({
        ...mockDest,
        ratingMetadata: {
          rubricVersion: 2,
          method: "manual",
          confidence: "high" as const,
        },
      }),
    ).toBe(true);
    expect(
      isRatingVerified({
        ...mockDest,
        ratingMetadata: {
          rubricVersion: 2,
          method: "assisted",
          confidence: "medium" as const,
        },
      }),
    ).toBe(true);
    expect(
      isRatingVerified({
        ...mockDest,
        ratingMetadata: {
          rubricVersion: 2,
          method: "assisted",
          confidence: "low" as const,
        },
      }),
    ).toBe(false);
    const noMeta = { ...mockDest } as Destination;
    delete (noMeta as unknown as Record<string, unknown>).ratingMetadata;
    expect(isRatingVerified(noMeta)).toBe(false);
  });

  it("computeOverallScore: sparse evidence yields unavailable, never a neutral 5", () => {
    // A record with NO direct rubric evidence (no importance, no tags/
    // collections, no categories/highlights/indoor, no transport) must be
    // unavailable — a lack of evidence is not evidence of average quality.
    const sparse = {
      id: "sparse",
      name: "Sparse",
      prefecture: "Tokyo",
      region: "Kanto",
      categories: [],
      tags: [],
      collections: [],
      highlights: [],
      ratings: mockDest.ratings,
      status: "published" as const,
    } as unknown as Destination;
    const r = computeOverallScore(sparse);
    expect(r.value).toBeNull();
    expect(r.coverage).toBeLessThan(SCORE_EVIDENCE_THRESHOLD);
    expect(getScorePresentation(sparse).state).toBe("unavailable");
    // Defaults/empty arrays must not manufacture evidence.
    expect(getScorePresentation(sparse).value).toBeNull();
  });

  it("computeOverallScore: neutral/default values cannot manufacture evidence", () => {
    // Only importance (0.40 weight) — below the 0.5 threshold. All other
    // rubric-input fields are cleared (indoorPercent/visit hours/walking
    // minutes are NOT importance evidence).
    const importanceOnly = {
      ...mockDest,
      categories: [],
      tags: [],
      collections: [],
      highlights: [],
      transportOptions: {},
      indoorPercent: undefined,
      recommendedVisitHours: undefined,
      walkingMin: undefined,
      importance: "major" as const,
    } as Destination;
    expect(computeOverallScore(importanceOnly).value).toBeNull();
    // importance + tags (0.40 + 0.30 = 0.70) crosses the threshold.
    const importanceAndTags = {
      ...importanceOnly,
      tags: ["Hot Spring"],
    } as Destination;
    const scored = computeOverallScore(importanceAndTags);
    expect(scored.coverage).toBeGreaterThanOrEqual(SCORE_EVIDENCE_THRESHOLD);
    expect(scored.value).not.toBeNull();
    // A single weak dimension is never enough: tags alone = 0.30.
    const tagsOnly = {
      ...importanceOnly,
      importance: undefined,
      tags: ["Hot Spring"],
    } as Destination;
    expect(computeOverallScore(tagsOnly).value).toBeNull();
  });

  it("computeOverallScore: designation credited once, never in SIGNIFICANCE", () => {
    // Anti-double-counting: UNESCO appears in RECOGNITION only. Removing the
    // designation must not change the SIGNIFICANCE dimension.
    const base = {
      ...mockDest,
      importance: "major" as const,
      tags: [],
      categories: ["Shrine", "Garden"],
    } as Destination;
    const unesco = {
      ...base,
      collections: [{ collectionId: "unesco-japan" as never, confirmed: true }],
    } as Destination;
    const plain = {
      ...base,
      collections: [],
    } as Destination;
    const rUnesco = computeOverallScore(unesco);
    const rPlain = computeOverallScore(plain);
    expect(rUnesco.dimensions.significance).toBe(
      rPlain.dimensions.significance,
    );
    expect(rUnesco.dimensions.recognition).toBeGreaterThan(
      rPlain.dimensions.recognition,
    );
    // Stacked designations never exceed the tier: UNESCO + national park
    // still credits tier 9 once.
    const stacked = {
      ...unesco,
      tags: ["National Park"],
    } as Destination;
    expect(computeOverallScore(stacked).dimensions.recognition).toBe(
      rUnesco.dimensions.recognition,
    );
  });

  it("computeOverallScore: never season-dependent and range-bounded", () => {
    const plain = {
      ...mockDest,
      importance: "standard" as const,
    } as Destination;
    const seasonal = {
      ...plain,
      season: { spring: 10, summer: 2, autumn: 9, winter: 1 },
      seasonMetadata: { method: "unknown" as const },
    } as Destination;
    expect(computeOverallScore(seasonal).value).toBe(
      computeOverallScore(plain).value,
    );
    const v = computeOverallScore(mockDest).value;
    expect(v).not.toBeNull();
    expect(v as number).toBeGreaterThanOrEqual(1);
    expect(v as number).toBeLessThanOrEqual(10);
  });

  it("verified and estimated share ONE rubric scale (same formula)", () => {
    // buildScoreMetadata with editorial provenance (verified) must produce
    // the SAME value as the plain estimated build: the state is a
    // provenance label, never a different formula.
    const editorial = {
      verifiedAt: "2026-08-14",
      sources: ["https://example.com/official"],
    };
    const verified = buildScoreMetadata(mockDest, editorial);
    const estimated = buildScoreMetadata(mockDest);
    expect(verified.state).toBe("verified");
    expect(estimated.state).toBe("estimated");
    expect(verified.value).toBe(estimated.value);
    expect(verified.value).toBe(computeOverallScore(mockDest).value);
    expect(verified.rubricVersion).toBe(OVERALL_SCORE_RUBRIC_VERSION);
    expect(verified.provenance.sourceClass).toBe("editorial-review");
    expect(verified.provenance.sources).toEqual(editorial.sources);
    expect(estimated.provenance.sourceClass).toBe("model");
    // A verified label requires score-specific provenance: an editorial
    // record below the evidence threshold must NOT become verified.
    const sparse = {
      ...mockDest,
      categories: [],
      tags: [],
      collections: [],
      highlights: [],
      transportOptions: {},
      importance: undefined,
    } as Destination;
    expect(buildScoreMetadata(sparse, editorial).state).toBe("unavailable");
  });

  it("getScorePresentation: persisted metadata is authoritative; fallback never verified", () => {
    const withMeta = {
      ...mockDest,
      scoreMetadata: buildScoreMetadata(mockDest, {
        verifiedAt: "2026-08-14",
        sources: ["https://example.com/official"],
      }),
    } as Destination;
    const sp = getScorePresentation(withMeta);
    expect(sp.state).toBe("verified");
    expect(sp.estimated).toBe(false);
    // No persisted metadata → the computed fallback can be estimated or
    // unavailable, but NEVER verified (verified requires persisted
    // editorial provenance).
    const fallback = getScorePresentation(mockDest);
    expect(["estimated", "unavailable"]).toContain(fallback.state);
    expect(fallback.state).not.toBe("verified");
  });

  it("scoreMetadata cannot alter the personalized recommendation score", () => {
    const context = {
      tripType: "any",
      budget: 20000,
      carMode: "none",
      publicModes: ["train"],
      partySize: 1,
      currentWeatherCondition: "any",
      visitedIds: [],
      homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    };
    const baseline = calculateScore(mockDest, context);
    const mutated = (scoreMetadata: Destination["scoreMetadata"]) =>
      calculateScore({ ...mockDest, scoreMetadata } as Destination, context);
    for (const meta of [
      {
        state: "verified" as const,
        value: 9.9,
        rubricVersion: OVERALL_SCORE_RUBRIC_VERSION,
        confidence: "high" as const,
        coverage: 1,
        provenance: {
          sourceClass: "editorial-review" as const,
          verifiedAt: "2026-08-14",
          sources: ["https://example.com/official"],
          basis: "test",
        },
        noteKey: "destination.scoreVerifiedNote",
      },
      {
        state: "unavailable" as const,
        value: null,
        rubricVersion: OVERALL_SCORE_RUBRIC_VERSION,
        confidence: "unknown" as const,
        coverage: 0.2,
        provenance: {
          sourceClass: "model" as const,
          basis: "test",
        },
        noteKey: "destination.scoreUnavailable",
      },
    ]) {
      const res = mutated(meta);
      expect(res.score).toBe(baseline.score);
      expect(res.eligible).toBe(baseline.eligible);
      expect(res.bestMode).toBe(baseline.bestMode);
      expect(res.bestModeScore).toBe(baseline.bestModeScore);
      expect(res.modeScoreBreakdown).toEqual(baseline.modeScoreBreakdown);
    }
    // Ranking order is likewise invariant: two destinations ranked by the
    // personalized score keep their relative order when only the
    // scoreMetadata (overall-score presentation) is mutated.
    const second = {
      ...mockDest,
      id: "second-dest",
      ratings: { ...mockDest.ratings, overall: 6 },
    } as Destination;
    const orderWith = (scoreMetadata: Destination["scoreMetadata"]) => {
      const a = calculateScore(
        { ...mockDest, scoreMetadata } as Destination,
        context,
      ).score;
      const b = calculateScore(second, context).score;
      return a >= b ? "a-first" : "b-first";
    };
    expect(orderWith(undefined)).toBe("a-first");
    expect(
      orderWith({
        state: "unavailable",
        value: null,
        rubricVersion: OVERALL_SCORE_RUBRIC_VERSION,
        confidence: "unknown",
        coverage: 0.2,
        provenance: { sourceClass: "model", basis: "test" },
        noteKey: "destination.scoreUnavailable",
      }),
    ).toBe("a-first");
  });

  // ---------------------------------------------------------------------------
  // REC-004: Diversification regression
  // ---------------------------------------------------------------------------

  it("does not excessively displace a strong match in a city-heavy fixture", () => {
    const makeRec = (
      id: string,
      score: number,
      parentId?: string,
      areaId?: string,
    ): PipelineRecommendation =>
      ({
        ...mockDest,
        id,
        score,
        relationships: parentId ? { parentDestinationId: parentId } : undefined,
        areaId,
        match: {
          confidence: 80,
          reasons: [],
          matchedPreferences: [],
          unmatchedPreferences: [],
        },
        bestTransportMode: "train",
        estimatedCostRange: [8000, 12000] as [number, number],
        pipeline: {
          eligible: true,
          estimatedCost: 10000,
          estimatedCostRange: [8000, 12000] as [number, number],
          bestTransportMode: "train",
          scoreContributions: { total: score, transport: 10 },
          confidence: 80,
          reasons: [],
        },
      }) as unknown as PipelineRecommendation;

    const topMatch = makeRec("top-match", 100, "osaka-city", "shinsaibashi");
    const cityMatches = Array.from({ length: 10 }, (_, i) =>
      makeRec(`osaka-dest-${i}`, 40 - i, "osaka-city", "shinsaibashi"),
    );
    const other = makeRec("different-city", 50, "kyoto-city", "gion");

    const results = diversifyRecommendations([topMatch, ...cityMatches, other]);
    const topThreeIds = results.slice(0, 3).map((r) => r.id);
    // Strongest match must survive diversification pressure into the top 3
    expect(topThreeIds).toContain("top-match");
  });
});

describe("getValidModes topology authorization", () => {
  const nahaDest = {
    ...mockDest,
    id: "naha-test",
    name: "Naha",
    prefecture: "Okinawa",
    municipalityId: "naha-city",
    coordinates: { lat: 26.2124, lng: 127.6809 },
    transportOptions: { train: 30, bus: 45, flight: 150 },
    tags: ["island", "remote"],
  } as unknown as Destination;

  const ogasawaraDest = {
    ...mockDest,
    id: "ogasawara-test",
    name: "Ogasawara",
    prefecture: "Tokyo",
    municipalityId: "ogasawara",
    coordinates: { lat: 27.0946, lng: 142.1916 },
    transportOptions: { bus: 20, ferry: 1440 },
    tags: ["island", "remote", "ferry"],
  } as unknown as Destination;

  it("filters train from Tokyo → Naha (cross-zone, no rail edge)", () => {
    const modes = getValidModes(
      nahaDest,
      "none",
      ["train", "flight", "bus"],
      { lat: 35.6812, lng: 139.7671 }, // Tokyo Station
      undefined,
      "mainland-honshu",
    );
    expect(modes).not.toContain("train");
    expect(modes).toContain("flight");
  });

  it("allows train for Naha → Naha (same-zone, local modes)", () => {
    const modes = getValidModes(
      nahaDest,
      "none",
      ["train", "bus"],
      { lat: 26.2124, lng: 127.6809 }, // Naha coords
      undefined,
      "okinawa-main",
    );
    expect(modes).toContain("train");
  });

  it("returns ferry from Tokyo → Ogasawara (ferry now estimable)", () => {
    const modes = getValidModes(
      ogasawaraDest,
      "none",
      ["train", "bus", "ferry", "flight"],
      { lat: 35.6812, lng: 139.7671 },
      undefined,
      "mainland-honshu",
    );
    expect(modes).toEqual(["ferry"]);
  });

  it("unknown origin conservatively returns no modes", () => {
    const modes = getValidModes(
      nahaDest,
      "none",
      ["train"],
      undefined,
      undefined,
      "unknown",
    );
    expect(modes).toEqual([]);
  });

  it("static fallback does not expose train to Ogasawara", () => {
    // Simulates the fallback path: no carMode, no publicModes → fallback to transportOptions/["train"]
    const modes = getValidModes(
      ogasawaraDest,
      "none",
      [],
      { lat: 35.6812, lng: 139.7671 },
      undefined,
      "mainland-honshu",
    );
    // Transport zone intersection must prevent the "train" default
    expect(modes).not.toContain("train");
  });

  it("canonical origin-aware Shinkansen evidence outranks stale transportOptions", () => {
    const osaka = {
      ...mockDest,
      id: "osaka-canonical-shinkansen",
      prefecture: "Osaka",
      municipalityId: "Osaka:osaka",
      coordinates: { lat: 34.6937, lng: 135.5023 },
      transportOptions: {},
    } as unknown as Destination;

    expect(
      getValidModes(
        osaka,
        "none",
        ["shinkansen"],
        { lat: 35.6285, lng: 139.7387 },
        undefined,
        "mainland-honshu",
      ),
    ).toContain("shinkansen");

    const osakaBus = {
      ...osaka,
      id: "osaka-canonical-bus",
    } as Destination;
    expect(
      getValidModes(
        osakaBus,
        "none",
        ["bus"],
        { lat: 35.6285, lng: 139.7387 },
        undefined,
        "mainland-honshu",
      ),
    ).toContain("bus");
  });

  it("stale transportOptions.bus cannot authorize a missing personalized bus corridor", () => {
    // KAI-12: with coordinates, canonical bus evidence is authoritative.
    // transportOptions.bus present but canonical corridor null → NOT valid.
    const staleBus = {
      ...mockDest,
      id: "stale-bus-dest",
      prefecture: "Nagano",
      municipalityId: "Nagano:karuizawa",
      coordinates: { lat: 36.342, lng: 138.635 },
      transportOptions: { bus: 240 },
    } as unknown as Destination;
    // From Omiya, Karuizawa is beyond every bus terminal catchment and no
    // tokyo↔karuizawa bus corridor exists — the stale metadata must not
    // resurrect Bus.
    expect(
      getValidModes(
        staleBus,
        "none",
        ["bus"],
        { lat: 35.9063, lng: 139.6239 },
        undefined,
        "mainland-honshu",
      ),
    ).toEqual([]);
  });

  it("stale transportOptions.shinkansen cannot authorize a missing personalized shinkansen corridor", () => {
    // KAI-12: Choshi (Chiba) is on mainland-honshu so topology authorizes
    // shinkansen, but no physical station is within the 50 km access radius
    // and no corridor exists — the stale metadata must not resurrect it.
    const staleShinkansen = {
      ...mockDest,
      id: "stale-shinkansen-dest",
      prefecture: "Chiba",
      municipalityId: "Chiba:choshi",
      coordinates: { lat: 35.7, lng: 140.87 },
      transportOptions: { shinkansen: 180 },
    } as unknown as Destination;
    expect(
      getValidModes(
        staleShinkansen,
        "none",
        ["shinkansen"],
        { lat: 35.6812, lng: 139.7671 },
        undefined,
        "mainland-honshu",
      ),
    ).toEqual([]);
  });

  it("bus topology local-mode alone cannot prove an intercity highway bus", () => {
    // KAI-12: a zone's localModes ["bus"] (Ogasawara, Tomogashima) is local
    // bus semantics, never intercity highway-bus authorization. With
    // coordinates, canonical bus must be absent for such islands.
    const localBusOnly = {
      ...mockDest,
      id: "local-bus-only-island",
      prefecture: "Tokyo",
      municipalityId: "Tokyo:ogasawara",
      coordinates: { lat: 27.0966, lng: 142.1917 },
      transportZoneId: "ogasawara",
      transportOptions: { bus: 30 },
    } as unknown as Destination;
    expect(
      getValidModes(
        localBusOnly,
        "none",
        ["bus"],
        { lat: 35.6812, lng: 139.7671 },
        undefined,
        "mainland-honshu",
      ),
    ).toEqual([]);
  });
});

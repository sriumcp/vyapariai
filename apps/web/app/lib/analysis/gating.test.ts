import { describe, test } from "node:test";
import assert from "node:assert";
import { checkAnalysisGating } from "./gating";
import type { Job, TextExtractionMetrics } from "../jobs";

// Helper to create a job with optional metrics
function makeJob(metrics?: TextExtractionMetrics): Job {
  return {
    id: "job-test-123",
    filename: "test.pdf",
    status: "SUCCEEDED",
    createdAt: "2024-01-01T00:00:00.000Z",
    textExtractionMetrics: metrics,
  };
}

// Helper to create metrics with defaults (passing all checks)
function makeMetrics(
  overrides: Partial<TextExtractionMetrics> = {}
): TextExtractionMetrics {
  return {
    charCount: 1000,
    wordCount: 100,
    lineCount: 50,
    nonAsciiRatio: 0.01,
    whitespaceRatio: 0.2,
    isEmpty: false,
    isLikelyScanned: false,
    qualityBand: "HIGH",
    ...overrides,
  };
}

describe("checkAnalysisGating", () => {
  test("no metrics returns MISSING_METRICS and allowed=false", () => {
    const job = makeJob(undefined);
    const result = checkAnalysisGating(job);

    assert.strictEqual(result.allowed, false);
    assert.deepStrictEqual(result.reasons, ["MISSING_METRICS"]);
    assert.strictEqual(result.isDegraded, false);
  });

  test("UNUSABLE policy (isEmpty) returns UNUSABLE_DOCUMENT and EMPTY_TEXT", () => {
    const job = makeJob(
      makeMetrics({ isEmpty: true, charCount: 0, wordCount: 0 })
    );
    const result = checkAnalysisGating(job);

    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes("UNUSABLE_DOCUMENT"));
    assert.ok(result.reasons.includes("EMPTY_TEXT"));
  });

  test("UNUSABLE policy (scanned + LOW) returns UNUSABLE_DOCUMENT", () => {
    const job = makeJob(
      makeMetrics({
        isLikelyScanned: true,
        qualityBand: "LOW",
        wordCount: 100,
        charCount: 1000,
      })
    );
    const result = checkAnalysisGating(job);

    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes("UNUSABLE_DOCUMENT"));
    assert.strictEqual(result.isDegraded, false); // UNUSABLE, not DEGRADED
  });

  test("wordCount < 50 returns INSUFFICIENT_WORDS", () => {
    const job = makeJob(makeMetrics({ wordCount: 49, charCount: 1000 }));
    const result = checkAnalysisGating(job);

    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes("INSUFFICIENT_WORDS"));
  });

  test("charCount < 250 returns INSUFFICIENT_CHARS", () => {
    const job = makeJob(makeMetrics({ charCount: 249, wordCount: 100 }));
    const result = checkAnalysisGating(job);

    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes("INSUFFICIENT_CHARS"));
  });

  test("wordCount=50 and charCount=250 passes thresholds", () => {
    const job = makeJob(makeMetrics({ wordCount: 50, charCount: 250 }));
    const result = checkAnalysisGating(job);

    assert.strictEqual(result.allowed, true);
    assert.deepStrictEqual(result.reasons, []);
  });

  test("multiple failures returns reasons in deterministic order", () => {
    // Trigger: UNUSABLE_DOCUMENT, EMPTY_TEXT, INSUFFICIENT_WORDS, INSUFFICIENT_CHARS
    const job = makeJob(
      makeMetrics({
        isEmpty: true,
        charCount: 0,
        wordCount: 0,
      })
    );
    const result = checkAnalysisGating(job);

    // Order must be: UNUSABLE_DOCUMENT, EMPTY_TEXT, INSUFFICIENT_WORDS, INSUFFICIENT_CHARS
    assert.strictEqual(result.reasons[0], "UNUSABLE_DOCUMENT");
    assert.strictEqual(result.reasons[1], "EMPTY_TEXT");
    assert.strictEqual(result.reasons[2], "INSUFFICIENT_WORDS");
    assert.strictEqual(result.reasons[3], "INSUFFICIENT_CHARS");
  });

  test("all checks pass returns allowed=true with empty reasons", () => {
    const job = makeJob(makeMetrics());
    const result = checkAnalysisGating(job);

    assert.strictEqual(result.allowed, true);
    assert.deepStrictEqual(result.reasons, []);
    assert.strictEqual(result.isDegraded, false);
  });

  test("DEGRADED policy sets isDegraded=true but allowed=true", () => {
    // isLikelyScanned with MEDIUM quality = DEGRADED (not UNUSABLE)
    const job = makeJob(
      makeMetrics({
        isLikelyScanned: true,
        qualityBand: "MEDIUM",
        wordCount: 100,
        charCount: 1000,
      })
    );
    const result = checkAnalysisGating(job);

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.isDegraded, true);
    assert.deepStrictEqual(result.reasons, []);
  });

  test("LOW qualityBand (not scanned) sets isDegraded=true", () => {
    const job = makeJob(
      makeMetrics({
        isLikelyScanned: false,
        qualityBand: "LOW",
        wordCount: 100,
        charCount: 1000,
      })
    );
    const result = checkAnalysisGating(job);

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.isDegraded, true);
  });
});

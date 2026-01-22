import { describe, test } from "node:test";
import assert from "node:assert";
import {
  deriveDocumentPolicy,
  REASON_DESCRIPTIONS,
  READINESS_GUIDANCE,
} from "./documentReadiness";
import type { TextExtractionMetrics } from "../jobs";

// Helper to create metrics with defaults
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

describe("deriveDocumentPolicy", () => {
  test("undefined metrics returns DEGRADED with empty reasons", () => {
    const policy = deriveDocumentPolicy(undefined);

    assert.strictEqual(policy.readiness, "DEGRADED");
    assert.deepStrictEqual(policy.reasons, []);
    assert.strictEqual(policy.canAnalyze, true);
    assert.strictEqual(policy.remediationRecommended, false);
    assert.strictEqual(policy.recommendedRemediation, "NONE");
  });

  test("isEmpty=true returns UNUSABLE with EMPTY_TEXT reason", () => {
    const metrics = makeMetrics({ isEmpty: true, charCount: 0, wordCount: 0 });
    const policy = deriveDocumentPolicy(metrics);

    assert.strictEqual(policy.readiness, "UNUSABLE");
    assert.deepStrictEqual(policy.reasons, ["EMPTY_TEXT"]);
    assert.strictEqual(policy.canAnalyze, false);
    assert.strictEqual(policy.remediationRecommended, true);
    assert.strictEqual(policy.recommendedRemediation, "OCR");
  });

  test("isLikelyScanned + qualityBand=LOW returns UNUSABLE with two reasons", () => {
    const metrics = makeMetrics({
      isLikelyScanned: true,
      qualityBand: "LOW",
    });
    const policy = deriveDocumentPolicy(metrics);

    assert.strictEqual(policy.readiness, "UNUSABLE");
    assert.deepStrictEqual(policy.reasons, [
      "LIKELY_SCANNED",
      "LOW_QUALITY_BAND",
    ]);
    assert.strictEqual(policy.canAnalyze, false);
    assert.strictEqual(policy.remediationRecommended, true);
    assert.strictEqual(policy.recommendedRemediation, "OCR");
  });

  test("isLikelyScanned + qualityBand=MEDIUM returns DEGRADED with LIKELY_SCANNED only", () => {
    const metrics = makeMetrics({
      isLikelyScanned: true,
      qualityBand: "MEDIUM",
    });
    const policy = deriveDocumentPolicy(metrics);

    assert.strictEqual(policy.readiness, "DEGRADED");
    assert.deepStrictEqual(policy.reasons, ["LIKELY_SCANNED"]);
    assert.strictEqual(policy.canAnalyze, true);
    assert.strictEqual(policy.remediationRecommended, true);
    assert.strictEqual(policy.recommendedRemediation, "OCR");
  });

  test("isLikelyScanned + qualityBand=HIGH returns DEGRADED with LIKELY_SCANNED only", () => {
    const metrics = makeMetrics({
      isLikelyScanned: true,
      qualityBand: "HIGH",
    });
    const policy = deriveDocumentPolicy(metrics);

    assert.strictEqual(policy.readiness, "DEGRADED");
    assert.deepStrictEqual(policy.reasons, ["LIKELY_SCANNED"]);
    assert.strictEqual(policy.canAnalyze, true);
    assert.strictEqual(policy.remediationRecommended, true);
    assert.strictEqual(policy.recommendedRemediation, "OCR");
  });

  test("qualityBand=LOW (not scanned) returns DEGRADED with LOW_QUALITY_BAND", () => {
    const metrics = makeMetrics({
      isLikelyScanned: false,
      qualityBand: "LOW",
    });
    const policy = deriveDocumentPolicy(metrics);

    assert.strictEqual(policy.readiness, "DEGRADED");
    assert.deepStrictEqual(policy.reasons, ["LOW_QUALITY_BAND"]);
    assert.strictEqual(policy.canAnalyze, true);
    assert.strictEqual(policy.remediationRecommended, true);
    assert.strictEqual(policy.recommendedRemediation, "NONE");
  });

  test("qualityBand=HIGH (not scanned) returns READY with no reasons", () => {
    const metrics = makeMetrics({
      isLikelyScanned: false,
      qualityBand: "HIGH",
    });
    const policy = deriveDocumentPolicy(metrics);

    assert.strictEqual(policy.readiness, "READY");
    assert.deepStrictEqual(policy.reasons, []);
    assert.strictEqual(policy.canAnalyze, true);
    assert.strictEqual(policy.remediationRecommended, false);
    assert.strictEqual(policy.recommendedRemediation, "NONE");
  });

  test("qualityBand=MEDIUM (not scanned) returns READY", () => {
    const metrics = makeMetrics({
      isLikelyScanned: false,
      qualityBand: "MEDIUM",
    });
    const policy = deriveDocumentPolicy(metrics);

    assert.strictEqual(policy.readiness, "READY");
    assert.deepStrictEqual(policy.reasons, []);
    assert.strictEqual(policy.canAnalyze, true);
  });
});

describe("documentReadiness constants", () => {
  test("REASON_DESCRIPTIONS contains all reason codes", () => {
    assert.ok("EMPTY_TEXT" in REASON_DESCRIPTIONS);
    assert.ok("LIKELY_SCANNED" in REASON_DESCRIPTIONS);
    assert.ok("LOW_QUALITY_BAND" in REASON_DESCRIPTIONS);
    assert.strictEqual(Object.keys(REASON_DESCRIPTIONS).length, 3);
  });

  test("READINESS_GUIDANCE contains all readiness statuses", () => {
    assert.ok("READY" in READINESS_GUIDANCE);
    assert.ok("DEGRADED" in READINESS_GUIDANCE);
    assert.ok("UNUSABLE" in READINESS_GUIDANCE);
    assert.strictEqual(Object.keys(READINESS_GUIDANCE).length, 3);
  });
});

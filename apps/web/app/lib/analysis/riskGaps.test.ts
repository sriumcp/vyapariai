import { describe, test } from "node:test";
import assert from "node:assert";
import { checkRiskGapsGating } from "./gating";
import { enrichRiskGapsResult } from "./riskGapsEnrichment";
import type { Job, TextExtractionMetrics } from "../jobs";
import type { AnalysisResult, RiskGapsModelOutput } from "./types";

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
    charCount: 5000,
    wordCount: 500,
    lineCount: 100,
    nonAsciiRatio: 0.01,
    whitespaceRatio: 0.2,
    isEmpty: false,
    isLikelyScanned: false,
    qualityBand: "HIGH",
    ...overrides,
  };
}

// Helper to create analysis result
function makeAnalysisResult(
  overrides: Partial<AnalysisResult> = {}
): AnalysisResult {
  return {
    docType: "INSURANCE_POLICY",
    summaryBullets: ["Test summary"],
    keyFields: [],
    confidence: "HIGH",
    notes: [],
    ...overrides,
  };
}

// =============================================================================
// checkRiskGapsGating Tests
// =============================================================================

describe("checkRiskGapsGating", () => {
  test("returns ANALYSIS_NOT_COMPLETE when no analysis result", () => {
    const job = makeJob(makeMetrics());
    const result = checkRiskGapsGating(job, null);

    assert.strictEqual(result.allowed, false);
    assert.deepStrictEqual(result.reasons, ["ANALYSIS_NOT_COMPLETE"]);
    assert.strictEqual(result.isDegraded, false);
    assert.deepStrictEqual(result.degradedReasons, []);
  });

  test("returns NOT_INSURANCE_DOCUMENT for INVOICE docType", () => {
    const job = makeJob(makeMetrics());
    const analysis = makeAnalysisResult({ docType: "INVOICE" });
    const result = checkRiskGapsGating(job, analysis);

    assert.strictEqual(result.allowed, false);
    assert.deepStrictEqual(result.reasons, ["NOT_INSURANCE_DOCUMENT"]);
    assert.strictEqual(result.isDegraded, false);
  });

  test("returns NOT_INSURANCE_DOCUMENT for BILL_OF_LADING docType", () => {
    const job = makeJob(makeMetrics());
    const analysis = makeAnalysisResult({ docType: "BILL_OF_LADING" });
    const result = checkRiskGapsGating(job, analysis);

    assert.strictEqual(result.allowed, false);
    assert.deepStrictEqual(result.reasons, ["NOT_INSURANCE_DOCUMENT"]);
  });

  test("returns NOT_INSURANCE_DOCUMENT for PACKING_LIST docType", () => {
    const job = makeJob(makeMetrics());
    const analysis = makeAnalysisResult({ docType: "PACKING_LIST" });
    const result = checkRiskGapsGating(job, analysis);

    assert.strictEqual(result.allowed, false);
    assert.deepStrictEqual(result.reasons, ["NOT_INSURANCE_DOCUMENT"]);
  });

  test("returns allowed=true with UNKNOWN_DOC_TYPE degraded reason for UNKNOWN docType", () => {
    const job = makeJob(makeMetrics());
    const analysis = makeAnalysisResult({ docType: "UNKNOWN" });
    const result = checkRiskGapsGating(job, analysis);

    assert.strictEqual(result.allowed, true);
    assert.deepStrictEqual(result.reasons, []);
    assert.strictEqual(result.isDegraded, true);
    assert.deepStrictEqual(result.degradedReasons, ["UNKNOWN_DOC_TYPE"]);
  });

  test("returns allowed=true with no degraded reasons for INSURANCE_POLICY", () => {
    const job = makeJob(makeMetrics());
    const analysis = makeAnalysisResult({ docType: "INSURANCE_POLICY" });
    const result = checkRiskGapsGating(job, analysis);

    assert.strictEqual(result.allowed, true);
    assert.deepStrictEqual(result.reasons, []);
    assert.strictEqual(result.isDegraded, false);
    assert.deepStrictEqual(result.degradedReasons, []);
  });

  test("returns INSUFFICIENT_TEXT_FOR_RISKS degraded reason when wordCount < 200", () => {
    const job = makeJob(makeMetrics({ wordCount: 199 }));
    const analysis = makeAnalysisResult({ docType: "INSURANCE_POLICY" });
    const result = checkRiskGapsGating(job, analysis);

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.isDegraded, true);
    assert.deepStrictEqual(result.degradedReasons, [
      "INSUFFICIENT_TEXT_FOR_RISKS",
    ]);
  });

  test("returns allowed=false with base gating reasons when metrics are missing", () => {
    const job = makeJob(undefined);
    const analysis = makeAnalysisResult({ docType: "INSURANCE_POLICY" });
    const result = checkRiskGapsGating(job, analysis);

    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes("MISSING_METRICS"));
  });

  test("returns allowed=false with UNKNOWN_DOC_TYPE degraded when UNKNOWN + base gating fails", () => {
    const job = makeJob(undefined); // No metrics
    const analysis = makeAnalysisResult({ docType: "UNKNOWN" });
    const result = checkRiskGapsGating(job, analysis);

    assert.strictEqual(result.allowed, false);
    assert.ok(result.reasons.includes("MISSING_METRICS"));
    assert.strictEqual(result.isDegraded, true);
    assert.deepStrictEqual(result.degradedReasons, ["UNKNOWN_DOC_TYPE"]);
  });

  test("can return multiple degraded reasons (UNKNOWN + INSUFFICIENT_TEXT)", () => {
    const job = makeJob(makeMetrics({ wordCount: 100 }));
    const analysis = makeAnalysisResult({ docType: "UNKNOWN" });
    const result = checkRiskGapsGating(job, analysis);

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.isDegraded, true);
    assert.ok(result.degradedReasons.includes("UNKNOWN_DOC_TYPE"));
    assert.ok(result.degradedReasons.includes("INSUFFICIENT_TEXT_FOR_RISKS"));
    assert.strictEqual(result.degradedReasons.length, 2);
  });

  test("wordCount=200 passes INSUFFICIENT_TEXT threshold", () => {
    const job = makeJob(makeMetrics({ wordCount: 200 }));
    const analysis = makeAnalysisResult({ docType: "INSURANCE_POLICY" });
    const result = checkRiskGapsGating(job, analysis);

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.isDegraded, false);
    assert.ok(!result.degradedReasons.includes("INSUFFICIENT_TEXT_FOR_RISKS"));
  });
});

// =============================================================================
// enrichRiskGapsResult Tests
// =============================================================================

describe("enrichRiskGapsResult", () => {
  const sampleText =
    "This policy excludes coverage for war and terrorism events. The deductible is $5,000. Coverage limit is $100,000.";

  test("computes overallRiskLevel as max severity using rank map", () => {
    const modelOutput: RiskGapsModelOutput = {
      riskGaps: [
        {
          category: "EXCLUSION",
          severity: "LOW",
          title: "Low risk",
          description: "Low desc",
          evidence: ["excludes coverage"],
        },
        {
          category: "LIMIT_CONCERN",
          severity: "HIGH",
          title: "High risk",
          description: "High desc",
          evidence: ["Coverage limit is $100,000"],
        },
        {
          category: "COVERAGE_GAP",
          severity: "MEDIUM",
          title: "Medium risk",
          description: "Medium desc",
          evidence: ["deductible is $5,000"],
        },
      ],
      summary: "Test summary",
      notes: [],
    };

    const result = enrichRiskGapsResult(modelOutput, sampleText);
    assert.strictEqual(result.overallRiskLevel, "HIGH");
  });

  test("returns INFO when riskGaps array is empty", () => {
    const modelOutput: RiskGapsModelOutput = {
      riskGaps: [],
      summary: "No risks found",
      notes: [],
    };

    const result = enrichRiskGapsResult(modelOutput, sampleText);
    assert.strictEqual(result.overallRiskLevel, "INFO");
  });

  test("sets default summary when empty and no gaps found", () => {
    const modelOutput: RiskGapsModelOutput = {
      riskGaps: [],
      summary: "",
      notes: [],
    };

    const result = enrichRiskGapsResult(modelOutput, sampleText);
    assert.strictEqual(
      result.summary,
      "No significant gaps found in the provided text excerpt."
    );
  });

  test("adds generic recommendation for HIGH/MEDIUM when missing", () => {
    const modelOutput: RiskGapsModelOutput = {
      riskGaps: [
        {
          category: "EXCLUSION",
          severity: "HIGH",
          title: "High risk",
          description: "High desc",
          evidence: ["excludes coverage"],
        },
      ],
      summary: "Test",
      notes: [],
    };

    const result = enrichRiskGapsResult(modelOutput, sampleText);
    assert.strictEqual(
      result.riskGaps[0].recommendation,
      "Confirm with insurer or broker; consider requesting an endorsement."
    );
  });

  test("adds generic recommendation for LOW/INFO when missing", () => {
    const modelOutput: RiskGapsModelOutput = {
      riskGaps: [
        {
          category: "AMBIGUITY",
          severity: "LOW",
          title: "Low risk",
          description: "Low desc",
          evidence: ["deductible is $5,000"],
        },
      ],
      summary: "Test",
      notes: [],
    };

    const result = enrichRiskGapsResult(modelOutput, sampleText);
    assert.strictEqual(
      result.riskGaps[0].recommendation,
      "Review with your insurance advisor."
    );
  });

  test("preserves existing recommendation when provided", () => {
    const modelOutput: RiskGapsModelOutput = {
      riskGaps: [
        {
          category: "EXCLUSION",
          severity: "HIGH",
          title: "High risk",
          description: "High desc",
          evidence: ["excludes coverage"],
          recommendation: "Custom recommendation",
        },
      ],
      summary: "Test",
      notes: [],
    };

    const result = enrichRiskGapsResult(modelOutput, sampleText);
    assert.strictEqual(
      result.riskGaps[0].recommendation,
      "Custom recommendation"
    );
  });

  test("adds excerpt limitation note", () => {
    const modelOutput: RiskGapsModelOutput = {
      riskGaps: [],
      summary: "Test",
      notes: [],
    };

    const result = enrichRiskGapsResult(modelOutput, sampleText);
    assert.ok(
      result.notes.some((n) =>
        n.includes("Analysis based on provided text excerpt")
      )
    );
  });

  test("adds analyzedAt timestamp", () => {
    const modelOutput: RiskGapsModelOutput = {
      riskGaps: [],
      summary: "Test",
      notes: [],
    };

    const before = new Date().toISOString();
    const result = enrichRiskGapsResult(modelOutput, sampleText);
    const after = new Date().toISOString();

    assert.ok(result.analyzedAt >= before);
    assert.ok(result.analyzedAt <= after);
  });

  // Evidence validation tests
  describe("evidence validation", () => {
    test("trims whitespace from evidence quotes", () => {
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "Test",
            description: "Desc",
            evidence: ["  excludes coverage  ", "\texcludes coverage\n"],
          },
        ],
        summary: "Test",
        notes: [],
      };

      const result = enrichRiskGapsResult(modelOutput, sampleText);
      // Should have deduplicated after trimming
      assert.strictEqual(result.riskGaps[0].evidence.length, 1);
      assert.strictEqual(result.riskGaps[0].evidence[0], "excludes coverage");
    });

    test("uses whitespace-normalized verification", () => {
      const textWithWeirdSpacing = "excludes    coverage   for   war";
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "Test",
            description: "Desc",
            evidence: ["excludes coverage for war"], // Normal spacing
          },
        ],
        summary: "Test",
        notes: [],
      };

      const result = enrichRiskGapsResult(modelOutput, textWithWeirdSpacing);
      // Should find the quote despite different whitespace
      assert.strictEqual(result.riskGaps[0].evidence.length, 1);
    });

    test("truncates quotes to 200 chars max after verification", () => {
      const longText = "A".repeat(300) + " unique marker";
      const longQuote = "A".repeat(250);
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "Test",
            description: "Desc",
            evidence: [longQuote],
          },
        ],
        summary: "Test",
        notes: [],
      };

      const result = enrichRiskGapsResult(modelOutput, longText);
      assert.strictEqual(result.riskGaps[0].evidence[0].length, 200);
    });

    test("removes duplicate identical quotes", () => {
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "Test",
            description: "Desc",
            evidence: [
              "excludes coverage",
              "excludes coverage",
              "excludes coverage",
            ],
          },
        ],
        summary: "Test",
        notes: [],
      };

      const result = enrichRiskGapsResult(modelOutput, sampleText);
      assert.strictEqual(result.riskGaps[0].evidence.length, 1);
    });

    test("removes quotes not found in source text (hallucination guard)", () => {
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "Test",
            description: "Desc",
            evidence: ["this quote does not exist in source"],
          },
        ],
        summary: "Test",
        notes: [],
      };

      const result = enrichRiskGapsResult(modelOutput, sampleText);
      // Gap should be removed because it has no valid evidence
      assert.strictEqual(result.riskGaps.length, 0);
    });

    test("removes gaps with no valid evidence after cleaning", () => {
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "Test",
            description: "Desc",
            evidence: ["nonexistent quote"],
          },
          {
            category: "COVERAGE_GAP",
            severity: "MEDIUM",
            title: "Test2",
            description: "Desc2",
            evidence: ["excludes coverage"], // This exists
          },
        ],
        summary: "Test",
        notes: [],
      };

      const result = enrichRiskGapsResult(modelOutput, sampleText);
      assert.strictEqual(result.riskGaps.length, 1);
      assert.strictEqual(result.riskGaps[0].title, "Test2");
    });

    test("adds note when evidence was dropped", () => {
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "Test",
            description: "Desc",
            evidence: ["nonexistent quote"],
          },
        ],
        summary: "Test",
        notes: [],
      };

      const result = enrichRiskGapsResult(modelOutput, sampleText);
      assert.ok(
        result.notes.some((n) =>
          n.includes("evidence could not be verified")
        )
      );
    });
  });

  // Gap deduplication tests
  describe("gap deduplication", () => {
    test("merges gaps with same category|severity|normalizedTitle", () => {
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "War Exclusion",
            description: "Short desc",
            evidence: ["excludes coverage for war"],
          },
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "war exclusion", // Same when normalized
            description: "Longer description that should be kept",
            evidence: ["terrorism events"],
          },
        ],
        summary: "Test",
        notes: [],
      };

      const result = enrichRiskGapsResult(modelOutput, sampleText);
      assert.strictEqual(result.riskGaps.length, 1);
      assert.strictEqual(
        result.riskGaps[0].description,
        "Longer description that should be kept"
      );
    });

    test("normalizes title: lowercase, strip punctuation, collapse whitespace", () => {
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "War & Terrorism!!!",
            description: "Desc1",
            evidence: ["excludes coverage for war"],
          },
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "war  terrorism", // Same after normalization
            description: "Desc2",
            evidence: ["terrorism events"],
          },
        ],
        summary: "Test",
        notes: [],
      };

      const result = enrichRiskGapsResult(modelOutput, sampleText);
      assert.strictEqual(result.riskGaps.length, 1);
    });

    test("combines evidence arrays (capped at 3)", () => {
      const text =
        "Quote one here. Quote two here. Quote three here. Quote four here.";
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "Test Gap",
            description: "Desc1",
            evidence: ["Quote one here", "Quote two here"],
          },
          {
            category: "EXCLUSION",
            severity: "HIGH",
            title: "test gap",
            description: "Desc2",
            evidence: ["Quote three here", "Quote four here"],
          },
        ],
        summary: "Test",
        notes: [],
      };

      const result = enrichRiskGapsResult(modelOutput, text);
      assert.strictEqual(result.riskGaps.length, 1);
      assert.ok(result.riskGaps[0].evidence.length <= 3);
    });
  });

  // Notes cleaning tests
  describe("notes cleaning", () => {
    test("trims notes and drops empty", () => {
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [],
        summary: "Test",
        notes: ["  Note with spaces  ", "", "   ", "Valid note"],
      };

      const result = enrichRiskGapsResult(modelOutput, sampleText);
      const modelNotes = result.notes.filter(
        (n) => !n.includes("excerpt") && !n.includes("evidence")
      );
      assert.strictEqual(modelNotes.length, 2);
      assert.strictEqual(modelNotes[0], "Note with spaces");
      assert.strictEqual(modelNotes[1], "Valid note");
    });

    test("caps individual note length (240 chars)", () => {
      const longNote = "A".repeat(300);
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [],
        summary: "Test",
        notes: [longNote],
      };

      const result = enrichRiskGapsResult(modelOutput, sampleText);
      const truncatedNote = result.notes.find((n) => n.startsWith("AAA"));
      assert.ok(truncatedNote);
      assert.strictEqual(truncatedNote.length, 240);
    });

    test("caps total notes count (8)", () => {
      const modelOutput: RiskGapsModelOutput = {
        riskGaps: [],
        summary: "Test",
        notes: Array(10).fill("Valid note"),
      };

      const result = enrichRiskGapsResult(modelOutput, sampleText);
      // 8 from model + up to 2 system notes = max 10, but model notes capped at 8
      // So we should have 8 model notes + system notes
      const modelNoteCount = result.notes.filter(
        (n) => n === "Valid note"
      ).length;
      assert.ok(modelNoteCount <= 8);
    });
  });
});

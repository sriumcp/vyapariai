import {
  RiskGap,
  RiskGapsModelOutput,
  RiskGapsResult,
  RiskSeverity,
} from "./types";

// Severity ranking (higher = worse)
const SEVERITY_RANK: Record<RiskSeverity, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

// Early caps to limit processing of potentially malformed model output
const MAX_RISK_GAPS = 20; // Cap total gaps before processing
const MAX_EVIDENCE_PER_GAP = 10; // Cap evidence array before processing

// RiskGap with required recommendation (after processing)
type ProcessedRiskGap = RiskGap & { recommendation: string };

/**
 * Normalizes whitespace in a string for comparison.
 * Collapses all whitespace sequences to single spaces and trims.
 */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Cleans evidence quotes by:
 * - Capping array early to limit processing
 * - Trimming whitespace
 * - Verifying quote exists in source text (using normalized comparison)
 * - Truncating to 200 chars after verification
 * - Removing duplicates
 * - Capping at 3 quotes
 */
function cleanEvidence(quotes: string[], sourceText: string): string[] {
  const normalizedSource = normalizeWhitespace(sourceText);

  return quotes
    .slice(0, MAX_EVIDENCE_PER_GAP) // Cap early to limit processing
    .map((q) => q.trim()) // Trim whitespace
    .filter((q) => q.length > 0) // Drop empty
    .filter((q) => normalizedSource.includes(normalizeWhitespace(q))) // Verify before truncation
    .map((q) => q.slice(0, 200)) // Truncate to 200 chars after verification
    .filter((q, i, arr) => arr.indexOf(q) === i) // Dedupe identical
    .slice(0, 3); // Cap at 3
}

/**
 * Normalizes a title for deduplication.
 * Lowercase, strip punctuation, collapse whitespace.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Deduplicates risk gaps by category|severity|normalizedTitle key.
 * When merging duplicates:
 * - Keeps longer description
 * - Combines evidence arrays (capped at 3)
 */
function dedupeGaps(gaps: ProcessedRiskGap[]): ProcessedRiskGap[] {
  const seen = new Map<string, ProcessedRiskGap>();

  for (const gap of gaps) {
    const normTitle = normalizeTitle(gap.title);
    const key = `${gap.category}|${gap.severity}|${normTitle}`;
    const existing = seen.get(key);

    if (existing) {
      // Merge: keep longer description, combine evidence
      existing.evidence = [
        ...new Set([...existing.evidence, ...gap.evidence]),
      ].slice(0, 3);
      if (gap.description.length > existing.description.length) {
        existing.description = gap.description;
      }
    } else {
      seen.set(key, { ...gap });
    }
  }

  return Array.from(seen.values());
}

/**
 * Enriches the model output with server-side computed fields.
 *
 * Processing steps:
 * 1. Validate and clean evidence quotes (trim, verify in source, truncate, dedupe)
 * 2. Remove gaps with no valid evidence
 * 3. Dedupe overlapping gaps
 * 4. Add generic recommendations where missing
 * 5. Compute overallRiskLevel from max severity
 * 6. Ensure summary is meaningful
 * 7. Clean and add system notes
 * 8. Add analyzedAt timestamp
 */
export function enrichRiskGapsResult(
  modelOutput: RiskGapsModelOutput,
  extractedText: string
): RiskGapsResult {
  // 0. Cap riskGaps array early to limit processing of malformed output
  const cappedGaps = modelOutput.riskGaps.slice(0, MAX_RISK_GAPS);

  // 1. Process gaps: clean evidence, add recommendations
  let processedGaps: ProcessedRiskGap[] = cappedGaps.map((gap) => ({
    ...gap,
    evidence: cleanEvidence(gap.evidence, extractedText),
    recommendation:
      gap.recommendation ||
      (gap.severity === "HIGH" || gap.severity === "MEDIUM"
        ? "Confirm with insurer or broker; consider requesting an endorsement."
        : "Review with your insurance advisor."),
  }));

  // 2. Remove gaps with no valid evidence
  const gapsBeforeFilter = processedGaps.length;
  processedGaps = processedGaps.filter((g) => g.evidence.length > 0);

  // 3. Dedupe overlapping gaps
  processedGaps = dedupeGaps(processedGaps);

  // 4. Compute overallRiskLevel from max severity
  let overallRiskLevel: RiskSeverity = "INFO";
  for (const gap of processedGaps) {
    if (SEVERITY_RANK[gap.severity] > SEVERITY_RANK[overallRiskLevel]) {
      overallRiskLevel = gap.severity;
    }
  }

  // 5. Ensure summary is meaningful
  let summary = modelOutput.summary?.trim() || "";
  if (processedGaps.length === 0 && !summary) {
    summary = "No significant gaps found in the provided text excerpt.";
  }

  // 6. Clean notes: trim, drop empty, cap length/count; then add system notes
  const notes = (modelOutput.notes || [])
    .map((n) => (n || "").trim())
    .filter((n) => n.length > 0)
    .map((n) => n.slice(0, 240)) // Cap individual note length
    .slice(0, 8); // Cap total notes count

  const hasEvidenceDropped = gapsBeforeFilter > processedGaps.length;
  if (hasEvidenceDropped) {
    notes.push(
      "Some findings were removed because evidence could not be verified in the text."
    );
  }
  if (!notes.some((n) => n.toLowerCase().includes("excerpt"))) {
    notes.push(
      "Analysis based on provided text excerpt; long documents may have additional relevant content."
    );
  }

  return {
    riskGaps: processedGaps,
    summary,
    notes,
    overallRiskLevel,
    analyzedAt: new Date().toISOString(),
  };
}

import { AnalysisBlockReason, GatingResult } from "./types";
import { Job } from "../jobs";
import { deriveDocumentPolicy } from "../policy/documentReadiness";

/**
 * Checks whether analysis is allowed for a given job.
 *
 * Deterministic reason order (reasons are checked and accumulated in this exact order):
 * 1. MISSING_METRICS - checked first, early return if missing
 * 2. UNUSABLE_DOCUMENT - policy-level block
 * 3. EMPTY_TEXT - no content
 * 4. INSUFFICIENT_WORDS - below 50 word threshold
 * 5. INSUFFICIENT_CHARS - below 250 char threshold
 *
 * The `reasons` array preserves this order for consistent UI display.
 */
export function checkAnalysisGating(job: Job): GatingResult {
  const reasons: AnalysisBlockReason[] = [];
  const metrics = job.textExtractionMetrics;

  // 1. Missing metrics - early return (can't evaluate other checks)
  if (!metrics) {
    return { allowed: false, reasons: ["MISSING_METRICS"], isDegraded: false };
  }

  // 2. Policy check (UNUSABLE)
  const policy = deriveDocumentPolicy(metrics);
  if (policy.readiness === "UNUSABLE") {
    reasons.push("UNUSABLE_DOCUMENT");
  }

  // 3. Empty text
  if (metrics.isEmpty === true) {
    reasons.push("EMPTY_TEXT");
  }

  // 4. Word count threshold
  if (metrics.wordCount < 50) {
    reasons.push("INSUFFICIENT_WORDS");
  }

  // 5. Char count threshold
  if (metrics.charCount < 250) {
    reasons.push("INSUFFICIENT_CHARS");
  }

  return {
    allowed: reasons.length === 0,
    reasons, // deterministic order as documented above
    isDegraded: policy.readiness === "DEGRADED",
  };
}

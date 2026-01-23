import {
  AnalysisBlockReason,
  AnalysisResult,
  GatingResult,
  RiskGapsBlockReason,
  RiskGapsDegradedReason,
  RiskGapsGatingResult,
} from "./types";
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

/**
 * Checks whether risk gaps analysis is allowed for a given job.
 *
 * Risk gaps analysis requires:
 * 1. Document analysis to have been run (analysisResult not null)
 * 2. Document type to be INSURANCE_POLICY or UNKNOWN (default deny)
 * 3. Base gating checks to pass (text quality, etc.)
 *
 * Degraded reasons (allowed but with warnings):
 * - UNKNOWN_DOC_TYPE: docType is UNKNOWN
 * - INSUFFICIENT_TEXT_FOR_RISKS: wordCount < 200
 */
export function checkRiskGapsGating(
  job: Job,
  analysisResult: AnalysisResult | null
): RiskGapsGatingResult {
  const degradedReasons: RiskGapsDegradedReason[] = [];

  // 1. Check if analysis has been run
  if (!analysisResult) {
    return {
      allowed: false,
      reasons: ["ANALYSIS_NOT_COMPLETE"],
      isDegraded: false,
      degradedReasons: [],
    };
  }

  // 2. Check document type (default deny: only INSURANCE_POLICY or UNKNOWN allowed)
  if (analysisResult.docType === "INSURANCE_POLICY") {
    // Good to go
  } else if (analysisResult.docType === "UNKNOWN") {
    degradedReasons.push("UNKNOWN_DOC_TYPE");
  } else {
    // Everything else (INVOICE, BILL_OF_LADING, PACKING_LIST, future types) → block
    return {
      allowed: false,
      reasons: ["NOT_INSURANCE_DOCUMENT"],
      isDegraded: false,
      degradedReasons: [],
    };
  }

  // 3. Run base gating checks
  const baseGating = checkAnalysisGating(job);
  if (!baseGating.allowed) {
    return {
      allowed: false,
      reasons: baseGating.reasons as RiskGapsBlockReason[],
      isDegraded: degradedReasons.length > 0,
      degradedReasons,
    };
  }

  // 4. Check text sufficiency (degrade, don't block)
  const metrics = job.textExtractionMetrics;
  if (metrics && metrics.wordCount < 200) {
    degradedReasons.push("INSUFFICIENT_TEXT_FOR_RISKS");
  }

  return {
    allowed: true,
    reasons: [],
    isDegraded: degradedReasons.length > 0,
    degradedReasons,
  };
}

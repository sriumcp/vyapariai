import type { TextExtractionMetrics } from "../jobs";

export type ReadinessStatus = "READY" | "DEGRADED" | "UNUSABLE";

// Reason codes in stable priority order
export type ReasonCode = "EMPTY_TEXT" | "LIKELY_SCANNED" | "LOW_QUALITY_BAND";

export type RecommendedRemediation = "NONE" | "OCR" | "EXTERNAL_EXTRACTOR";

export interface DocumentPolicy {
  readiness: ReadinessStatus;
  reasons: ReasonCode[]; // stable priority order
  canAnalyze: boolean;
  remediationRecommended: boolean;
  recommendedRemediation: RecommendedRemediation;
}

/**
 * Derives a document readiness policy from text extraction metrics.
 * Pure function - computed at read time, not persisted.
 *
 * Rules (in order):
 * 1. If metrics undefined: DEGRADED (unknown state)
 * 2. If isEmpty: UNUSABLE + EMPTY_TEXT
 * 3. If isLikelyScanned && qualityBand==="LOW": UNUSABLE + [LIKELY_SCANNED, LOW_QUALITY_BAND]
 * 4. If isLikelyScanned: DEGRADED + LIKELY_SCANNED
 * 5. If qualityBand==="LOW": DEGRADED + LOW_QUALITY_BAND
 * 6. Else: READY
 */
export function deriveDocumentPolicy(
  metrics: TextExtractionMetrics | undefined
): DocumentPolicy {
  // Unknown state - no metrics available
  if (metrics === undefined) {
    return {
      readiness: "DEGRADED",
      reasons: [],
      canAnalyze: true,
      remediationRecommended: false,
      recommendedRemediation: "NONE",
    };
  }

  // Empty text - nothing to analyze
  if (metrics.isEmpty) {
    return {
      readiness: "UNUSABLE",
      reasons: ["EMPTY_TEXT"],
      canAnalyze: false,
      remediationRecommended: true,
      recommendedRemediation: "OCR",
    };
  }

  // Scanned + low quality - unusable
  if (metrics.isLikelyScanned && metrics.qualityBand === "LOW") {
    return {
      readiness: "UNUSABLE",
      reasons: ["LIKELY_SCANNED", "LOW_QUALITY_BAND"],
      canAnalyze: false,
      remediationRecommended: true,
      recommendedRemediation: "OCR",
    };
  }

  // Scanned but acceptable quality - degraded
  if (metrics.isLikelyScanned) {
    return {
      readiness: "DEGRADED",
      reasons: ["LIKELY_SCANNED"],
      canAnalyze: true,
      remediationRecommended: true,
      recommendedRemediation: "OCR",
    };
  }

  // Low quality but not scanned - degraded
  if (metrics.qualityBand === "LOW") {
    return {
      readiness: "DEGRADED",
      reasons: ["LOW_QUALITY_BAND"],
      canAnalyze: true,
      remediationRecommended: true,
      recommendedRemediation: "NONE",
    };
  }

  // Good quality, not scanned - ready
  return {
    readiness: "READY",
    reasons: [],
    canAnalyze: true,
    remediationRecommended: false,
    recommendedRemediation: "NONE",
  };
}

/** Human-readable descriptions for reason codes */
export const REASON_DESCRIPTIONS: Record<ReasonCode, string> = {
  EMPTY_TEXT: "No text content was extracted from this document.",
  LIKELY_SCANNED: "Document appears to be scanned or image-based.",
  LOW_QUALITY_BAND: "Text extraction quality is low.",
};

/** Guidance messages for each readiness status */
export const READINESS_GUIDANCE: Record<ReadinessStatus, string> = {
  READY: "This document appears usable for analysis.",
  DEGRADED:
    "Analysis may be incomplete. Consider re-uploading a text-based PDF.",
  UNUSABLE:
    "This document cannot be analyzed reliably. OCR or a text-based PDF is required (OCR not implemented yet).",
};

// Document type classification
export type DocType =
  | "INVOICE"
  | "INSURANCE_POLICY"
  | "BILL_OF_LADING"
  | "PACKING_LIST"
  | "UNKNOWN";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface KeyField {
  label: string;
  value: string;
  evidence: string;
}

// Main analysis result (returned by OpenAI, cached in analysis.json)
export interface AnalysisResult {
  docType: DocType;
  summaryBullets: string[];
  keyFields: KeyField[];
  confidence: ConfidenceLevel;
  notes: string[];
}

// Gating types
export type AnalysisBlockReason =
  | "UNUSABLE_DOCUMENT"
  | "MISSING_METRICS"
  | "EMPTY_TEXT"
  | "INSUFFICIENT_WORDS"
  | "INSUFFICIENT_CHARS";

export interface GatingResult {
  allowed: boolean;
  reasons: AnalysisBlockReason[]; // deterministic order (see gating.ts)
  isDegraded: boolean; // for UI warning display
}

// API response types
export interface AnalysisBlockedResponse {
  error: "ANALYSIS_BLOCKED";
  reasons: AnalysisBlockReason[];
}

// =============================================================================
// Risk Gaps Analysis Types
// =============================================================================

// Risk severity levels
export type RiskSeverity = "HIGH" | "MEDIUM" | "LOW" | "INFO";

// Risk categories for insurance documents
export type RiskCategory =
  | "COVERAGE_GAP" // Explicit coverage limitation found
  | "EXCLUSION" // Concerning exclusions or carve-outs
  | "LIMIT_CONCERN" // Potentially insufficient limits
  | "AMBIGUITY" // Vague or unclear language
  | "COMPLIANCE" // Regulatory or compliance issues
  | "OTHER";

// Individual risk gap
export interface RiskGap {
  category: RiskCategory;
  severity: RiskSeverity;
  title: string; // Short description (e.g., "No marine transit coverage")
  description: string; // Detailed explanation
  evidence: string[]; // 1-3 short quotes from document (<=200 chars each)
  recommendation?: string; // Optional from model; server always fills in
}

// What the model returns (server adds overallRiskLevel + analyzedAt)
export interface RiskGapsModelOutput {
  riskGaps: RiskGap[];
  summary: string; // 1-2 sentence executive summary
  notes: string[]; // Caveats or limitations
}

// Full result after server-side enrichment
export interface RiskGapsResult extends RiskGapsModelOutput {
  overallRiskLevel: RiskSeverity; // Computed server-side: max severity or INFO
  analyzedAt: string; // ISO timestamp, added server-side
}

// Gating for risk gaps analysis (blocking reasons)
export type RiskGapsBlockReason =
  | "ANALYSIS_NOT_COMPLETE" // Document analysis hasn't been run
  | "NOT_INSURANCE_DOCUMENT" // docType is neither INSURANCE_POLICY nor UNKNOWN
  | AnalysisBlockReason; // Inherits base reasons (MISSING_METRICS, etc.)

// Degraded (warning) reasons - allowed but with caveats
export type RiskGapsDegradedReason =
  | "UNKNOWN_DOC_TYPE" // docType === UNKNOWN
  | "INSUFFICIENT_TEXT_FOR_RISKS"; // wordCount < 200

export interface RiskGapsGatingResult {
  allowed: boolean;
  reasons: RiskGapsBlockReason[];
  isDegraded: boolean; // True if degradedReasons.length > 0
  degradedReasons: RiskGapsDegradedReason[]; // Explains *why* degraded
}

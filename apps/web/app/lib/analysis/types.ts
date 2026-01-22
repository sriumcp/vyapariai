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

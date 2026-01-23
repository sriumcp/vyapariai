"use client";

import { useState } from "react";
import type {
  RiskGapsResult,
  RiskGapsGatingResult,
  RiskGapsBlockReason,
  RiskGapsDegradedReason,
  RiskSeverity,
  RiskCategory,
  ConfidenceLevel,
} from "../../lib/analysis/types";

interface RiskGapsSectionProps {
  jobId: string;
  gatingResult: RiskGapsGatingResult;
  initialRiskGaps: RiskGapsResult | null;
  analysisConfidence: ConfidenceLevel | null;
}

const BLOCK_MESSAGES: Record<RiskGapsBlockReason, string> = {
  ANALYSIS_NOT_COMPLETE: "Run document analysis first to enable risk gap analysis.",
  NOT_INSURANCE_DOCUMENT: "Risk gap analysis is available for insurance policies only.",
  UNUSABLE_DOCUMENT: "Document is unusable for analysis.",
  MISSING_METRICS: "Text extraction metrics are not available.",
  EMPTY_TEXT: "No text content was extracted.",
  INSUFFICIENT_WORDS: "Document has fewer than 50 words.",
  INSUFFICIENT_CHARS: "Document has fewer than 250 characters.",
};

const DEGRADED_WARNINGS: Record<RiskGapsDegradedReason, string> = {
  UNKNOWN_DOC_TYPE: "Document type uncertain; results may be less reliable.",
  INSUFFICIENT_TEXT_FOR_RISKS: "Document has limited extracted text; analysis may be incomplete.",
};

const SEVERITY_COLORS: Record<RiskSeverity, string> = {
  HIGH: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  MEDIUM: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  LOW: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  INFO: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

const CATEGORY_LABELS: Record<RiskCategory, string> = {
  COVERAGE_GAP: "Coverage Gap",
  EXCLUSION: "Exclusion",
  LIMIT_CONCERN: "Limit Concern",
  AMBIGUITY: "Ambiguity",
  COMPLIANCE: "Compliance",
  OTHER: "Other",
};

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  HIGH: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  LOW: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function RiskGapsSection({
  jobId,
  gatingResult,
  initialRiskGaps,
  analysisConfidence,
}: RiskGapsSectionProps) {
  const [riskGaps, setRiskGaps] = useState<RiskGapsResult | null>(initialRiskGaps);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunAnalysis = async (force: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/risk-gaps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });

      if (res.status === 422) {
        const data = await res.json();
        if (data.allowed === false && data.reasons) {
          setError(
            `Analysis blocked: ${data.reasons.map((r: RiskGapsBlockReason) => BLOCK_MESSAGES[r] || r).join(", ")}`
          );
        } else {
          setError("Analysis blocked");
        }
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Risk analysis failed");
        return;
      }

      const result = await res.json();
      setRiskGaps(result);
    } catch {
      setError("Failed to run risk analysis");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
      {/* Header with badges */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Risk Gaps Analysis
        </h2>
        {riskGaps && (
          <>
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${SEVERITY_COLORS[riskGaps.overallRiskLevel]}`}
            >
              {riskGaps.overallRiskLevel} Risk
            </span>
            {analysisConfidence && (
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${CONFIDENCE_COLORS[analysisConfidence]}`}
              >
                {analysisConfidence} Confidence
              </span>
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="mb-4">
        {!gatingResult.allowed ? (
          <button
            disabled
            className="cursor-not-allowed rounded bg-zinc-300 px-4 py-2 text-sm font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
          >
            Run Risk Analysis
          </button>
        ) : (
          <button
            onClick={() => handleRunAnalysis(riskGaps !== null)}
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {loading
              ? "Analyzing..."
              : riskGaps
                ? "Re-run Analysis"
                : "Run Risk Analysis"}
          </button>
        )}
      </div>

      {/* Blocked state */}
      {!gatingResult.allowed && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="mb-2 font-medium text-red-800 dark:text-red-200">
            Risk analysis unavailable
          </p>
          <ul className="list-inside list-disc text-sm text-red-700 dark:text-red-300">
            {gatingResult.reasons.map((reason) => (
              <li key={reason}>{BLOCK_MESSAGES[reason] || reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Degraded warnings */}
      {gatingResult.allowed && gatingResult.isDegraded && !riskGaps && (
        <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
          {gatingResult.degradedReasons.map((reason) => (
            <p key={reason} className="text-sm text-yellow-800 dark:text-yellow-200">
              Warning: {DEGRADED_WARNINGS[reason]}
            </p>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button
            onClick={() => handleRunAnalysis(false)}
            className="mt-2 text-sm text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {riskGaps && (
        <div className="space-y-6">
          {/* Summary */}
          {riskGaps.summary && (
            <div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {riskGaps.summary}
              </p>
            </div>
          )}

          {/* Risk cards */}
          {riskGaps.riskGaps.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {riskGaps.riskGaps.map((gap, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
                >
                  {/* Card header with badges */}
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[gap.severity]}`}
                    >
                      {gap.severity}
                    </span>
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                      {CATEGORY_LABELS[gap.category]}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {gap.title}
                  </h3>

                  {/* Description */}
                  <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {gap.description}
                  </p>

                  {/* Evidence quotes */}
                  {gap.evidence.length > 0 && (
                    <div className="mb-3">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Evidence
                      </p>
                      <ul className="list-inside list-disc space-y-1 text-sm text-zinc-500 dark:text-zinc-400">
                        {gap.evidence.map((quote, j) => (
                          <li key={j} className="italic">
                            &quot;{quote}&quot;
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommendation */}
                  {gap.recommendation && (
                    <div className="rounded bg-zinc-50 p-2 dark:bg-zinc-900">
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Recommendation
                      </p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">
                        {gap.recommendation}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <p className="text-sm text-green-700 dark:text-green-300">
                No significant gaps found in the provided text excerpt.
              </p>
            </div>
          )}

          {/* Notes */}
          {riskGaps.notes.length > 0 && (
            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Notes
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-zinc-500 dark:text-zinc-400">
                {riskGaps.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Analyzed timestamp */}
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Analyzed: {new Date(riskGaps.analyzedAt).toLocaleString()}
          </p>
        </div>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import type {
  AnalysisResult,
  GatingResult,
  AnalysisBlockReason,
  DocType,
  ConfidenceLevel,
} from "../../lib/analysis/types";

interface AnalysisSectionProps {
  jobId: string;
  gatingResult: GatingResult;
  initialAnalysis: AnalysisResult | null;
}

const BLOCK_REASON_MESSAGES: Record<AnalysisBlockReason, string> = {
  UNUSABLE_DOCUMENT: "Document is unusable for analysis",
  MISSING_METRICS: "Text extraction metrics are not available",
  EMPTY_TEXT: "No text content was extracted",
  INSUFFICIENT_WORDS: "Document has fewer than 50 words",
  INSUFFICIENT_CHARS: "Document has fewer than 250 characters",
};

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  HIGH: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  MEDIUM:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  LOW: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const DOC_TYPE_LABELS: Record<DocType, string> = {
  INVOICE: "Invoice",
  INSURANCE_POLICY: "Insurance Policy",
  BILL_OF_LADING: "Bill of Lading",
  PACKING_LIST: "Packing List",
  UNKNOWN: "Unknown",
};

export default function AnalysisSection({
  jobId,
  gatingResult,
  initialAnalysis,
}: AnalysisSectionProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(
    initialAnalysis
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunAnalysis = async (force: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });

      if (res.status === 409) {
        const data = await res.json();
        if (data.error === "ANALYSIS_BLOCKED") {
          setError(
            `Analysis blocked: ${data.reasons.map((r: AnalysisBlockReason) => BLOCK_REASON_MESSAGES[r]).join(", ")}`
          );
        } else {
          setError("Analysis blocked");
        }
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Analysis failed");
        return;
      }

      const result = await res.json();
      setAnalysis(result);
    } catch {
      setError("Failed to run analysis");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Document Analysis
      </h2>

      {/* Action buttons */}
      <div className="mb-4">
        {!gatingResult.allowed ? (
          <button
            disabled
            className="cursor-not-allowed rounded bg-zinc-300 px-4 py-2 text-sm font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
          >
            Run Analysis
          </button>
        ) : (
          <button
            onClick={() => handleRunAnalysis(analysis !== null)}
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {loading
              ? "Analyzing..."
              : analysis
                ? "Re-run Analysis"
                : "Run Analysis"}
          </button>
        )}
      </div>

      {/* Warnings and errors */}
      {!gatingResult.allowed && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="mb-2 font-medium text-red-800 dark:text-red-200">
            Analysis unavailable
          </p>
          <ul className="list-inside list-disc text-sm text-red-700 dark:text-red-300">
            {gatingResult.reasons.map((reason) => (
              <li key={reason}>{BLOCK_REASON_MESSAGES[reason]}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            Text-only analysis requires readable text content. OCR is not
            implemented yet.
          </p>
        </div>
      )}

      {gatingResult.allowed && gatingResult.isDegraded && !analysis && (
        <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Warning: Document quality is degraded. Analysis results may be
            incomplete.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Analysis results */}
      {analysis && (
        <div className="space-y-4">
          {/* Header with type and confidence */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded bg-zinc-200 px-3 py-1 text-sm font-medium text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200">
              {DOC_TYPE_LABELS[analysis.docType]}
            </span>
            <span
              className={`rounded px-3 py-1 text-sm font-medium ${CONFIDENCE_COLORS[analysis.confidence]}`}
            >
              {analysis.confidence} Confidence
            </span>
          </div>

          {/* Summary bullets */}
          {analysis.summaryBullets.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Summary
              </h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {analysis.summaryBullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Key fields table */}
          {analysis.keyFields.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Key Fields
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="pb-2 pr-4 font-medium text-zinc-700 dark:text-zinc-300">
                        Field
                      </th>
                      <th className="pb-2 pr-4 font-medium text-zinc-700 dark:text-zinc-300">
                        Value
                      </th>
                      <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">
                        Evidence
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.keyFields.map((field, i) => (
                      <tr
                        key={i}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="py-2 pr-4 text-zinc-800 dark:text-zinc-200">
                          {field.label}
                        </td>
                        <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">
                          {field.value}
                        </td>
                        <td className="py-2 text-zinc-500 dark:text-zinc-500">
                          <span className="italic">&quot;{field.evidence}&quot;</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes */}
          {analysis.notes.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Notes
              </h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {analysis.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { promises as fs } from "fs";
import * as path from "path";
import { getJobById, DATA_DIR } from "../../lib/jobs";
import {
  deriveDocumentPolicy,
  REASON_DESCRIPTIONS,
  READINESS_GUIDANCE,
  type ReasonCode,
  type ReadinessStatus,
} from "../../lib/policy/documentReadiness";
import { checkAnalysisGating, checkRiskGapsGating } from "../../lib/analysis/gating";
import type { AnalysisResult, RiskGapsResult } from "../../lib/analysis/types";
import ExtractedTextViewer from "./ExtractedTextViewer";
import AnalysisSection from "./AnalysisSection";
import RiskGapsSection from "./RiskGapsSection";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Badge styling for each readiness status */
function getReadinessBadgeStyles(readiness: ReadinessStatus): string {
  switch (readiness) {
    case "READY":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "DEGRADED":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "UNUSABLE":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  }
}

/** Guidance box styling for each readiness status */
function getGuidanceStyles(readiness: ReadinessStatus): string {
  switch (readiness) {
    case "READY":
      return "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200";
    case "DEGRADED":
      return "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200";
    case "UNUSABLE":
      return "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
  }
}

export default async function JobPage({ params }: PageProps) {
  const { id } = await params;
  const job = getJobById(id);

  if (!job) {
    notFound();
  }

  const metrics = job.textExtractionMetrics;
  const isSucceeded = job.status === "SUCCEEDED";

  // Compute document readiness policy from metrics
  const policy = deriveDocumentPolicy(metrics);

  // Compute analysis gating result
  const gatingResult = checkAnalysisGating(job);

  // Check for cached analysis
  let cachedAnalysis: AnalysisResult | null = null;
  if (isSucceeded) {
    const analysisPath = path.join(DATA_DIR, "uploads", id, "analysis.json");
    try {
      const content = await fs.readFile(analysisPath, "utf-8");
      cachedAnalysis = JSON.parse(content);
    } catch {
      // No cached analysis
    }
  }

  // Check for cached risk gaps
  let cachedRiskGaps: RiskGapsResult | null = null;
  if (isSucceeded) {
    const riskGapsPath = path.join(DATA_DIR, "uploads", id, "risk-gaps.json");
    try {
      const content = await fs.readFile(riskGapsPath, "utf-8");
      cachedRiskGaps = JSON.parse(content);
    } catch {
      // No cached risk gaps
    }
  }

  // Compute risk gaps gating result
  const riskGapsGatingResult = checkRiskGapsGating(job, cachedAnalysis);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-block text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          &larr; Back to Dashboard
        </Link>

        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Job Details
        </h1>

        {/* Status and Timestamps */}
        <div className="mb-8 space-y-2">
          <p className="text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">Filename:</span> {job.filename}
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">Status:</span>{" "}
            <span
              className={
                job.status === "SUCCEEDED"
                  ? "text-green-700 dark:text-green-400"
                  : job.status === "FAILED"
                    ? "text-red-700 dark:text-red-400"
                    : job.status === "RUNNING"
                      ? "text-yellow-700 dark:text-yellow-400"
                      : "text-zinc-700 dark:text-zinc-300"
              }
            >
              {job.status}
            </span>
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">Created:</span>{" "}
            {new Date(job.createdAt).toLocaleString()}
          </p>
          {job.startedAt && (
            <p className="text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">Started:</span>{" "}
              {new Date(job.startedAt).toLocaleString()}
            </p>
          )}
          {job.finishedAt && (
            <p className="text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">Finished:</span>{" "}
              {new Date(job.finishedAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Document Readiness */}
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Document Readiness
          </h2>

          {/* Readiness Badge */}
          <div className="mb-4">
            <span
              className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${getReadinessBadgeStyles(policy.readiness)}`}
            >
              {policy.readiness}
            </span>
          </div>

          {/* Reasons List */}
          {policy.reasons.length > 0 && (
            <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {policy.reasons.map((reason: ReasonCode) => (
                <li key={reason}>{REASON_DESCRIPTIONS[reason]}</li>
              ))}
            </ul>
          )}

          {/* Guidance Box */}
          <div
            className={`rounded border p-4 text-sm ${getGuidanceStyles(policy.readiness)}`}
          >
            {READINESS_GUIDANCE[policy.readiness]}
          </div>
        </div>

        {/* Document Analysis */}
        {isSucceeded && (
          <div className="mb-8">
            <AnalysisSection
              jobId={id}
              gatingResult={gatingResult}
              initialAnalysis={cachedAnalysis}
            />
          </div>
        )}

        {/* Risk Gaps Analysis */}
        {isSucceeded && (
          <div className="mb-8">
            <RiskGapsSection
              jobId={id}
              gatingResult={riskGapsGatingResult}
              initialRiskGaps={cachedRiskGaps}
              analysisConfidence={cachedAnalysis?.confidence ?? null}
            />
          </div>
        )}

        {/* Text Quality Metrics */}
        {metrics && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Text Quality Metrics
            </h2>

            {!isSucceeded && (
              <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                Note: Job has not completed successfully
              </p>
            )}

            <div className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
              <p className="mb-2 text-lg font-medium text-zinc-900 dark:text-zinc-100">
                Quality:{" "}
                <span
                  className={
                    metrics.qualityBand === "HIGH"
                      ? "text-green-700 dark:text-green-400"
                      : metrics.qualityBand === "LOW"
                        ? "text-red-700 dark:text-red-400"
                        : "text-yellow-700 dark:text-yellow-400"
                  }
                >
                  {metrics.qualityBand}
                </span>
              </p>
              <div className="grid gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-2">
                <p>Characters: {metrics.charCount.toLocaleString()}</p>
                <p>Words: {metrics.wordCount.toLocaleString()}</p>
                <p>Lines: {metrics.lineCount.toLocaleString()}</p>
                <p>Non-ASCII: {(metrics.nonAsciiRatio * 100).toFixed(1)}%</p>
                <p>Whitespace: {(metrics.whitespaceRatio * 100).toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Extracted Text (SUCCEEDED only) */}
        {isSucceeded && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Extracted Text
            </h2>
            <ExtractedTextViewer jobId={job.id} />
          </div>
        )}

        {/* Artifacts */}
        <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Artifacts
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
            <h3 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
              Summary
            </h3>
            {job.artifacts?.summary ? (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {job.artifacts.summary}
              </p>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Document summary will appear here once processing is complete.
              </p>
            )}
          </div>

          <div className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
            <h3 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
              Risk Gaps
            </h3>
            {job.artifacts?.riskGaps && job.artifacts.riskGaps.length > 0 ? (
              <ul className="list-disc pl-4 text-sm text-zinc-700 dark:text-zinc-300">
                {job.artifacts.riskGaps.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Identified risks and compliance gaps will appear here.
              </p>
            )}
          </div>

          <div className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
            <h3 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
              Exporter Checklist
            </h3>
            {job.artifacts?.checklist && job.artifacts.checklist.length > 0 ? (
              <ul className="list-disc pl-4 text-sm text-zinc-700 dark:text-zinc-300">
                {job.artifacts.checklist.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Recommended action items for exporters will appear here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import { getJobById, DATA_DIR } from "../../../../lib/jobs";
import { checkRiskGapsGating } from "../../../../lib/analysis/gating";
import { runRiskGapsAnalysis } from "../../../../lib/analysis/openai";
import { enrichRiskGapsResult } from "../../../../lib/analysis/riskGapsEnrichment";
import type { AnalysisResult, RiskGapsResult } from "../../../../lib/analysis/types";

// Valid jobId format: alphanumeric with hyphens and underscores
const JOB_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// Cached result with fingerprints for invalidation
interface CachedRiskGapsResult extends RiskGapsResult {
  _meta?: {
    analysisFingerprint: string;
    textFingerprint: string;
  };
}

/**
 * Compute a short fingerprint (hash) of content for cache invalidation.
 */
function computeFingerprint(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // 1. Validate jobId format (defense-in-depth)
  if (!id || !JOB_ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  // 2. Load job from store
  const job = getJobById(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Parse request body for force flag
  let force = false;
  try {
    const body = await request.json();
    if (typeof body.force === "boolean") {
      force = body.force;
    }
  } catch {
    // No body or invalid JSON - use defaults
  }

  // Compute paths with safety checks
  const uploadsDir = path.resolve(DATA_DIR, "uploads");
  const jobDir = path.resolve(uploadsDir, id);

  // Safety check: ensure jobDir is within uploadsDir (prevents traversal via id)
  if (!jobDir.startsWith(uploadsDir + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const riskGapsPath = path.resolve(jobDir, "risk-gaps.json");
  const analysisPath = path.resolve(jobDir, "analysis.json");
  const textPath = path.resolve(jobDir, "extracted_text.txt");

  // 3. Load analysis.json and extracted text for fingerprinting
  let analysisContent: string | null = null;
  let analysisResult: AnalysisResult | null = null;
  try {
    analysisContent = await fs.readFile(analysisPath, "utf-8");
    analysisResult = JSON.parse(analysisContent);
  } catch {
    // Analysis not available
  }

  let extractedText: string | null = null;
  try {
    extractedText = await fs.readFile(textPath, "utf-8");
  } catch {
    // Text not available - will be caught later if needed
  }

  // Compute fingerprints of current inputs
  const currentAnalysisFingerprint = analysisContent
    ? computeFingerprint(analysisContent)
    : "";
  const currentTextFingerprint = extractedText
    ? computeFingerprint(extractedText)
    : "";

  // 4. Check cache with fingerprint validation
  if (!force) {
    try {
      const cached = await fs.readFile(riskGapsPath, "utf-8");
      const cachedResult: CachedRiskGapsResult = JSON.parse(cached);

      // Validate fingerprints match current inputs
      if (
        cachedResult._meta &&
        cachedResult._meta.analysisFingerprint === currentAnalysisFingerprint &&
        cachedResult._meta.textFingerprint === currentTextFingerprint
      ) {
        // Return cached result without _meta (destructure to omit it)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _meta, ...result } = cachedResult;
        return NextResponse.json(result);
      }
      // Fingerprints don't match - cache is stale, continue to re-analyze
    } catch {
      // No cache or invalid cache - continue
    }
  }

  // 5. Run gating checks
  const gating = checkRiskGapsGating(job, analysisResult);
  if (!gating.allowed) {
    return NextResponse.json(
      {
        allowed: false,
        reasons: gating.reasons,
      },
      { status: 422 }
    );
  }

  // 6. Verify API key is configured before proceeding
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not configured");
    return NextResponse.json(
      { error: "Analysis service not configured" },
      { status: 503 }
    );
  }

  // 7. Verify extracted text is available
  if (!extractedText) {
    return NextResponse.json(
      { error: "Extracted text not available" },
      { status: 404 }
    );
  }

  // 8. Call OpenAI and enrich result
  try {
    const modelOutput = await runRiskGapsAnalysis(extractedText, analysisResult!);

    // 9. Enrich with server-side processing
    const result = enrichRiskGapsResult(modelOutput, extractedText);

    // 10. Cache with fingerprints for invalidation
    const cachedResult: CachedRiskGapsResult = {
      ...result,
      _meta: {
        analysisFingerprint: currentAnalysisFingerprint,
        textFingerprint: currentTextFingerprint,
      },
    };
    await fs.writeFile(
      riskGapsPath,
      JSON.stringify(cachedResult, null, 2),
      "utf-8"
    );

    // 11. Return result (without _meta)
    return NextResponse.json(result);
  } catch (error) {
    console.error(`Risk gaps analysis failed for job ${id}:`, error);
    return NextResponse.json(
      { error: "Risk analysis failed" },
      { status: 500 }
    );
  }
}

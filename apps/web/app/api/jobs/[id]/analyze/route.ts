export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import * as path from "path";
import { getJobById, DATA_DIR } from "../../../../lib/jobs";
import { checkAnalysisGating } from "../../../../lib/analysis/gating";
import { runAnalysis } from "../../../../lib/analysis/openai";
import type { AnalysisBlockedResponse } from "../../../../lib/analysis/types";

// Valid jobId format: alphanumeric with hyphens and underscores
const JOB_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

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

  const analysisPath = path.resolve(jobDir, "analysis.json");
  const textPath = path.resolve(jobDir, "extracted_text.txt");

  // 3. Check cache FIRST (before gating)
  if (!force) {
    try {
      const cached = await fs.readFile(analysisPath, "utf-8");
      const cachedResult = JSON.parse(cached);
      return NextResponse.json(cachedResult);
    } catch {
      // No cache - continue to gating
    }
  }

  // 4. Apply gating checks
  const gating = checkAnalysisGating(job);
  if (!gating.allowed) {
    const response: AnalysisBlockedResponse = {
      error: "ANALYSIS_BLOCKED",
      reasons: gating.reasons,
    };
    return NextResponse.json(response, { status: 409 });
  }

  // 5. Verify API key is configured before proceeding
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not configured");
    return NextResponse.json(
      { error: "Analysis service not configured" },
      { status: 503 }
    );
  }

  // 6. Load extracted text
  let extractedText: string;
  try {
    extractedText = await fs.readFile(textPath, "utf-8");
  } catch {
    return NextResponse.json(
      { error: "Extracted text not available" },
      { status: 404 }
    );
  }

  // 7. Call OpenAI Responses API
  try {
    const result = await runAnalysis(extractedText);

    // 8. Save result to cache
    await fs.writeFile(analysisPath, JSON.stringify(result, null, 2), "utf-8");

    // 9. Return JSON result
    return NextResponse.json(result);
  } catch (error) {
    console.error(`Analysis failed for job ${id}:`, error);
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}

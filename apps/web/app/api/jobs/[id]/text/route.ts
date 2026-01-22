import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import * as path from "path";
import { getJobById, DATA_DIR } from "../../../../lib/jobs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // Validate job exists
  const job = getJobById(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Compute expected path from jobId (not from stored artifact path)
  const uploadsDir = path.resolve(DATA_DIR, "uploads");
  const expectedDir = path.resolve(uploadsDir, id);

  // Safety check: ensure expectedDir is within uploadsDir (prevents traversal via id)
  if (!expectedDir.startsWith(uploadsDir + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const textFilePath = path.resolve(expectedDir, "extracted_text.txt");

  // Read file content
  try {
    const content = await fs.readFile(textFilePath, "utf-8");
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch {
    // File doesn't exist or can't be read
    return NextResponse.json(
      { error: "Extracted text not available" },
      { status: 404 }
    );
  }
}

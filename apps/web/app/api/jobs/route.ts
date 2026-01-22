import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createJob, getAllJobs, generateJobId, getUploadDir } from "../../lib/jobs";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function GET() {
  const jobs = getAllJobs();
  return NextResponse.json(jobs);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "file is required" },
      { status: 400 }
    );
  }

  // Validate PDF
  const isPdfMime = file.type === "application/pdf";
  const isPdfExtension = file.name.toLowerCase().endsWith(".pdf");
  if (!isPdfMime && !isPdfExtension) {
    return NextResponse.json(
      { error: "file must be a PDF" },
      { status: 400 }
    );
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "file size exceeds 20MB limit" },
      { status: 413 }
    );
  }

  // Generate job ID and create upload directory
  const jobId = generateJobId();
  const uploadDir = getUploadDir(jobId);
  await mkdir(uploadDir, { recursive: true });

  // Write file to disk
  const storedPath = `.data/uploads/${jobId}/document.pdf`;
  const absolutePath = path.join(uploadDir, "document.pdf");
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  // Create job with document metadata
  const job = createJob(file.name, {
    id: jobId,
    document: {
      originalName: file.name,
      storedPath,
      mimeType: file.type || "application/pdf",
      sizeBytes: file.size,
    },
  });

  return NextResponse.json(job, { status: 201 });
}

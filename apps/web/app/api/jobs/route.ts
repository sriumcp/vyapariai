import { NextRequest, NextResponse } from "next/server";
import { createJob, getAllJobs } from "../../lib/jobs";

export async function GET() {
  const jobs = getAllJobs();
  return NextResponse.json(jobs);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { filename } = body;

  if (!filename || typeof filename !== "string") {
    return NextResponse.json(
      { error: "filename is required and must be a string" },
      { status: 400 }
    );
  }

  const job = createJob(filename);
  return NextResponse.json(job, { status: 201 });
}

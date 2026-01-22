import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export type JobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface JobArtifacts {
  summary?: string;
  riskGaps?: string[];
  checklist?: string[];
}

export interface JobDocument {
  originalName: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface Job {
  id: string;
  filename: string;
  status: JobStatus;
  createdAt: string;
  artifacts?: JobArtifacts;
  document?: JobDocument;
}

// Path to the JSON store at repo root
const DATA_DIR = path.join(process.cwd(), "..", "..", ".data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJobsFile(): Job[] {
  ensureDataDir();
  if (!fs.existsSync(JOBS_FILE)) {
    return [];
  }
  const data = fs.readFileSync(JOBS_FILE, "utf-8");
  return JSON.parse(data) as Job[];
}

function writeJobsFile(jobs: Job[]): void {
  ensureDataDir();
  // Atomic write: write to temp file then rename
  const tempFile = path.join(os.tmpdir(), `jobs-${Date.now()}.json`);
  fs.writeFileSync(tempFile, JSON.stringify(jobs, null, 2), "utf-8");
  fs.renameSync(tempFile, JOBS_FILE);
}

export function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function getUploadDir(jobId: string): string {
  return path.join(DATA_DIR, "uploads", jobId);
}

export function getAllJobs(): Job[] {
  const jobs = readJobsFile();
  // Return newest first
  return jobs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getJobById(id: string): Job | undefined {
  const jobs = readJobsFile();
  return jobs.find((job) => job.id === id);
}

export function createJob(
  filename: string,
  options?: { id?: string; document?: JobDocument }
): Job {
  const jobs = readJobsFile();
  const newJob: Job = {
    id: options?.id ?? generateJobId(),
    filename,
    status: "PENDING",
    createdAt: new Date().toISOString(),
    document: options?.document,
  };
  jobs.push(newJob);
  writeJobsFile(jobs);
  return newJob;
}

export function updateJob(id: string, updates: Partial<Job>): Job | undefined {
  const jobs = readJobsFile();
  const index = jobs.findIndex((job) => job.id === id);
  if (index === -1) {
    return undefined;
  }
  jobs[index] = { ...jobs[index], ...updates };
  writeJobsFile(jobs);
  return jobs[index];
}

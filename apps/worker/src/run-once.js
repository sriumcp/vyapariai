const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

// Path to the JSON store at repo root
const DATA_DIR = path.join(__dirname, "..", "..", "..", ".data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJobsFile() {
  ensureDataDir();
  if (!fs.existsSync(JOBS_FILE)) {
    return [];
  }
  const data = fs.readFileSync(JOBS_FILE, "utf-8");
  return JSON.parse(data);
}

function writeJobsFile(jobs) {
  ensureDataDir();
  // Atomic write: write to temp file then rename
  const tempFile = path.join(os.tmpdir(), `jobs-${Date.now()}.json`);
  fs.writeFileSync(tempFile, JSON.stringify(jobs, null, 2), "utf-8");
  fs.renameSync(tempFile, JOBS_FILE);
}

function extractTextFromPdf(pdfPath, outputPath) {
  // Use pdftotext with -layout to preserve formatting, output to file
  // execFileSync avoids shell interpolation (safe for filenames with special chars)
  execFileSync("pdftotext", ["-layout", pdfPath, outputPath]);
}

function main() {
  console.log("Worker: Looking for PENDING jobs...");

  const jobs = readJobsFile();

  if (jobs.length === 0) {
    console.log("Worker: No jobs found in store.");
    return;
  }

  // Find the first PENDING job
  const pendingIndex = jobs.findIndex((job) => job.status === "PENDING");

  if (pendingIndex === -1) {
    console.log("Worker: No PENDING jobs found.");
    return;
  }

  const job = jobs[pendingIndex];
  console.log(`Worker: Processing job ${job.id} (${job.filename})`);

  // Validate job has document metadata
  if (!job.document || !job.document.storedPath) {
    console.error(`Worker: Job ${job.id} has no document metadata.`);
    jobs[pendingIndex] = {
      ...job,
      status: "FAILED",
    };
    writeJobsFile(jobs);
    return;
  }

  // Resolve PDF path (storedPath is relative like ".data/uploads/<jobId>/document.pdf")
  const pdfPath = path.join(__dirname, "..", "..", "..", job.document.storedPath);

  // Check if PDF exists
  if (!fs.existsSync(pdfPath)) {
    console.error(`Worker: PDF file not found at ${pdfPath}`);
    jobs[pendingIndex] = {
      ...job,
      status: "FAILED",
    };
    writeJobsFile(jobs);
    return;
  }

  // Output path for extracted text
  const jobUploadDir = path.join(DATA_DIR, "uploads", job.id);
  const extractedTextPath = path.join(jobUploadDir, "extracted_text.txt");
  const relativeExtractedTextPath = `.data/uploads/${job.id}/extracted_text.txt`;

  try {
    console.log(`Worker: Extracting text from ${pdfPath}...`);
    extractTextFromPdf(pdfPath, extractedTextPath);
    console.log(`Worker: Text extracted to ${extractedTextPath}`);

    // Update job with success status and artifact metadata
    jobs[pendingIndex] = {
      ...job,
      status: "SUCCEEDED",
      artifacts: {
        extractedText: {
          path: relativeExtractedTextPath,
        },
      },
    };
    writeJobsFile(jobs);
    console.log(`Worker: Job ${job.id} marked as SUCCEEDED with extractedText artifact.`);
  } catch (error) {
    console.error(`Worker: Failed to extract text from PDF: ${error.message}`);
    jobs[pendingIndex] = {
      ...job,
      status: "FAILED",
    };
    writeJobsFile(jobs);
    console.log(`Worker: Job ${job.id} marked as FAILED.`);
  }

  console.log("Worker: Done.");
}

main();

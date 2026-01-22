const fs = require("fs");
const path = require("path");
const os = require("os");

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

  // Update job status and add placeholder artifacts
  jobs[pendingIndex] = {
    ...job,
    status: "SUCCEEDED",
    artifacts: {
      summary: `This is a placeholder summary for ${job.filename}. The document has been analyzed and processed successfully.`,
      riskGaps: [
        "Coverage limit may be insufficient for high-value shipments",
        "Policy excludes certain destination countries",
        "Deductible clause requires review for compliance",
      ],
      checklist: [
        "Verify beneficiary details match trade documents",
        "Confirm shipment date falls within policy period",
        "Ensure cargo description matches commercial invoice",
        "Check that packaging requirements are met",
        "Submit claim within specified timeframe if needed",
      ],
    },
  };

  writeJobsFile(jobs);

  console.log(`Worker: Job ${job.id} marked as SUCCEEDED with artifacts.`);
  console.log("Worker: Done.");
}

main();

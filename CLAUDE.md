# CLAUDE.md

Guidance for AI coding sessions in this repository.

## Project Overview

vyapari.ai is a document-processing web app for MSME exporters, designed to
incrementally evolve into an AI-assisted decision-support system.

- Users upload PDFs (insurance policies, trade documents)
- System processes them via background jobs to produce explicit artifacts
- User-triggered AI analysis extracts document type, key fields with evidence, and summary
- Risk gaps analysis identifies coverage gaps and exclusions in insurance policies
- Current focus is on deterministic ingestion, text extraction, quality signals, and gated analysis


## Repo Structure

```
vyapariai/
├── apps/
│   ├── web/                    # Next.js App Router (TypeScript)
│   │   └── app/
│   │       ├── api/jobs/       # API routes (analyze, risk-gaps, text)
│   │       ├── jobs/[id]/      # Job detail page + AnalysisSection + RiskGapsSection
│   │       └── lib/
│   │           ├── analysis/   # Gating, OpenAI wrapper, enrichment, types
│   │           └── policy/     # Document readiness policy
│   └── worker/                 # Background worker for PDF processing
├── .data/                      # Local store (not committed)
│   ├── jobs.json
│   └── uploads/<jobId>/
│       ├── document.pdf
│       ├── extracted_text.txt
│       ├── analysis.json       # Cached document analysis
│       └── risk-gaps.json      # Cached risk gaps analysis (insurance only)
├── package.json                # Root workspace config
└── CLAUDE.md
```

- Root uses npm workspaces (`apps/*`)
- `apps/web` is the user-facing frontend with API routes for job management
- `apps/worker` handles long-running processing
- `.data/jobs.json` stores jobs locally; `.data/uploads/` stores uploaded PDFs (both gitignored)

## Architectural Principles

1. **Jobs are the core abstraction**: upload → job → artifacts
2. **Separation of concerns**: web app orchestrates and displays; worker executes heavy processing
3. **Start simple, evolve incrementally**: avoid overengineering
4. **No premature infrastructure or abstraction**: add complexity only when needed

## Current State

- Jobs are persisted via JSON file store (`.data/jobs.json`)
- `apps/web` exposes API routes:
  - `POST /api/jobs` — upload a PDF and create a job (multipart/form-data, field `"file"`, validates PDF type/extension, max 20MB)
  - `GET /api/jobs` — list all jobs
  - `GET /api/jobs/[id]` — get job details and artifacts
  - `GET /api/jobs/[id]/text` — returns extracted_text.txt as text/plain
  - `POST /api/jobs/[id]/analyze` — user-triggered document analysis (gated, cached, server-side OpenAI)
  - `POST /api/jobs/[id]/risk-gaps` — user-triggered risk gaps analysis (requires document analysis first, insurance policies only)
- `apps/worker` has a `run-once` script that processes one PENDING job by extracting PDF text and computing deterministic text quality metrics
- Job detail page displays status, timestamps, document readiness, analysis section, risk gaps section, extracted text, and metrics
- Local development only (no deployment targets)

## Current Constraints

- No database (JSON file store only)
- No authentication
- No OCR (text extraction only works on PDFs with embedded text)
- No queues; worker reads directly from job store
- Local development only
- `.data/` is a local-only development store and must never be committed to git
- Any code touching `.data/` should assume single-user local development
- AI analysis is user-triggered only (no automatic analysis on upload)


## Current Implemented State (Authoritative)

As of now, the following are implemented:

### Job Storage & Upload
- Jobs are persisted locally via a JSON-backed store under `.data/jobs.json` (not committed)
- Uploaded PDFs are stored at `.data/uploads/<jobId>/document.pdf`
- Each job includes a `document` field with metadata: `originalName`, `storedPath`, `mimeType`, `sizeBytes`

### API Routes (apps/web)
- `POST /api/jobs` — accepts multipart/form-data with field `"file"` (PDF, max 20MB)
- `GET /api/jobs` — list all jobs
- `GET /api/jobs/[id]` — get job details
- `GET /api/jobs/[id]/text` — returns extracted_text.txt as text/plain (path traversal protected)
- `POST /api/jobs/[id]/analyze` — user-triggered document analysis:
  - JobId validation: rejects invalid format with 400
  - Gated: blocks if UNUSABLE, missing metrics, isEmpty, wordCount<50, or charCount<250
  - Cached: returns `.data/uploads/<jobId>/analysis.json` if exists (unless `force: true`)
  - Server-side only: calls OpenAI Responses API with extracted text (no PDF/images sent)
  - Returns strict JSON: `{ docType, summaryBullets, keyFields[], confidence, notes }`
- `POST /api/jobs/[id]/risk-gaps` — user-triggered risk gaps analysis:
  - JobId validation: rejects invalid format with 400
  - Gated: requires document analysis first; blocks non-insurance documents (INVOICE, BOL, etc.)
  - Degraded mode: allows UNKNOWN docType and short text (<200 words) with warnings
  - Cache invalidation: stores fingerprints of analysis.json and extracted_text.txt; invalidates if inputs change
  - Server-side enrichment: validates evidence quotes against source text, dedupes gaps, computes overallRiskLevel
  - Returns: `{ riskGaps[], summary, notes, overallRiskLevel, analyzedAt }`

### Document Readiness Policy
- `deriveDocumentPolicy(metrics)` computes readiness from textExtractionMetrics
- Readiness levels: READY | DEGRADED | UNUSABLE
- Reason codes: EMPTY_TEXT | LIKELY_SCANNED | LOW_QUALITY_BAND
- Surfaced in job detail UI with guidance messages

### Risk Gaps Analysis
- Separate user-triggered analysis that runs after document analysis
- Only available for insurance policies (INSURANCE_POLICY docType) or UNKNOWN (degraded mode)
- Gating: `checkRiskGapsGating(job, analysisResult)` in `gating.ts`
  - Blocks: ANALYSIS_NOT_COMPLETE, NOT_INSURANCE_DOCUMENT, base gating failures
  - Degraded (warns but allows): UNKNOWN_DOC_TYPE, INSUFFICIENT_TEXT_FOR_RISKS (<200 words)
- Server-side enrichment in `riskGapsEnrichment.ts`:
  - Evidence validation: whitespace-normalized verification against source text
  - Hallucination guard: removes gaps with unverifiable evidence quotes
  - Gap deduplication: merges by category|severity|normalizedTitle
  - Early capping: limits riskGaps (20) and evidence arrays (10) before processing
  - Computes `overallRiskLevel` as max severity across all gaps
- Cache invalidation: fingerprints (SHA-256) of analysis.json and extracted_text.txt stored in risk-gaps.json
- Risk categories: COVERAGE_GAP, EXCLUSION, LIMIT_CONCERN, AMBIGUITY, COMPLIANCE, OTHER
- Severity levels: HIGH, MEDIUM, LOW, INFO

### Job Detail Page (`/jobs/[id]`)
- Status and timestamps
- Document readiness badge with reasons and guidance
- Analysis section (for SUCCEEDED jobs):
  - "Run Analysis" button (disabled when gating blocks)
  - Degraded warning when allowed but quality is low
  - Results display: docType, confidence, summaryBullets, keyFields with evidence, notes
- Risk gaps section (for SUCCEEDED jobs):
  - "Run Risk Analysis" button (disabled when gating blocks or document analysis not run)
  - Degraded warnings for UNKNOWN docType or short text
  - Results display: overallRiskLevel badge, risk cards with severity/category/evidence/recommendation, notes
- Text quality metrics
- Extracted text (read-only, truncated; loaded via client component)

### Worker (apps/worker)
- Run-once processor that:
  - Finds a PENDING job
  - Extracts text using Poppler `pdftotext` (embedded text only, no OCR)
  - Writes extracted text to `.data/uploads/<jobId>/extracted_text.txt`
  - Computes deterministic text quality metrics
  - Marks job SUCCEEDED or FAILED

### Text Extraction Metrics
- `charCount`, `wordCount`, `lineCount`: basic counts
- `nonAsciiRatio`, `whitespaceRatio`: ratios (0..1)
- `isEmpty`: boolean (true if charCount === 0)
- `isLikelyScanned`: boolean (conservative rule-based heuristic)
- `qualityBand`: "LOW" | "MEDIUM" | "HIGH" (rule-based)

### Tests
- Worker tests: `npm -w apps/worker test` runs unit tests for text metrics
- Web tests: `npm -w apps/web test` runs unit tests for:
  - Document readiness policy
  - Analysis gating (`checkAnalysisGating`)
  - Risk gaps gating (`checkRiskGapsGating`)
  - Risk gaps enrichment (evidence validation, deduplication, severity computation)

Anything not listed here should be assumed NOT implemented.


## AI Contribution Rules

1. Do not refactor repo structure unless explicitly asked
2. Do not add infrastructure (DB, auth, queues, deployment) unless explicitly asked
3. Make small, testable changes
4. Prefer clarity over cleverness
5. Always list files changed at the end of a task
6. Never upload PDFs or images to any LLM unless explicitly instructed; analysis uses extracted_text.txt only.
7. AI calls must be gated, cached, and user-triggered to control cost and prevent accidental usage.


## Workflow

Use the following workflow for non-trivial changes:

- **Plan first**: Create and get approval for the implementation plan before writing code.
- **Implement**: Execute the approved plan.
- **Review gate**: Strict code review before merge; security and path-safety issues must be fixed.
- **Iterate**: If review finds issues, fix and re-review until approved.

## Environment Variables

Create `apps/web/.env.local`:

```bash
# Required for AI analysis feature
OPENAI_API_KEY=sk-your-api-key-here

# Optional: specify model (defaults to gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini
```

## How to Run Locally

```bash
# Install dependencies
npm install

# Run the web app
npm run dev:web

# Run the worker (processes one PENDING job)
npm run dev:worker
```

### Workflow
1. Open http://localhost:3000/dashboard
2. Upload a PDF
3. Run `npm run dev:worker` in another terminal to process the job
4. Click the job to view details
5. Click "Run Analysis" to trigger document analysis (requires OPENAI_API_KEY)
6. For insurance policies: Click "Run Risk Analysis" to identify coverage gaps

## How to Start a New Claude Session

When starting a new Claude session:
1. Read this file fully.
2. Summarize your understanding of the repo and constraints.
3. Wait for confirmation before writing code.

## Explicit Non-Goals (Near-term)

- Multi-document workflows
- Cross-job reasoning
- Automatic analysis on upload
- OCR or scanned document remediation
- Production deployment or scaling concerns



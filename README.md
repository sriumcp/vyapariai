# vyapari.ai

A document-processing web app for MSME exporters, designed to incrementally evolve into an AI-assisted decision-support system.

## Features

- **PDF Upload**: Upload trade documents (invoices, insurance policies, bills of lading, packing lists)
- **Text Extraction**: Automatic text extraction using Poppler `pdftotext`
- **Quality Metrics**: Deterministic text quality analysis with readiness indicators
- **AI Analysis**: User-triggered document analysis via OpenAI (extracts document type, key fields with evidence, summary)

## Prerequisites

- **Node.js** 18+
- **Poppler** (for PDF text extraction)
  ```bash
  # macOS
  brew install poppler

  # Ubuntu/Debian
  sudo apt-get install poppler-utils
  ```
- **OpenAI API Key** (optional, required for AI analysis feature)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in `apps/web/`:

```bash
# Required for AI analysis feature
OPENAI_API_KEY=sk-your-api-key-here

# Optional: specify model (defaults to gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini
```

### 3. Run the web app

```bash
npm run dev:web
```

The app will be available at http://localhost:3000

### 4. Upload and process a document

1. Go to http://localhost:3000/dashboard
2. Upload a PDF document
3. In a separate terminal, run the worker to process the job:
   ```bash
   npm run dev:worker
   ```
4. Refresh the dashboard to see the updated job status
5. Click on the job to view details and run analysis

## Project Structure

```
vyapariai/
├── apps/
│   ├── web/        # Next.js App Router (TypeScript)
│   └── worker/     # Background worker for PDF processing
├── .data/          # Local store (gitignored)
│   ├── jobs.json   # Job records
│   └── uploads/    # Uploaded PDFs and artifacts
│       └── <jobId>/
│           ├── document.pdf
│           ├── extracted_text.txt
│           └── analysis.json (after AI analysis)
├── package.json    # Root workspace config
├── CLAUDE.md       # AI coding guidance
└── README.md
```

## Workflow

1. **Upload**: User uploads a PDF via the dashboard
2. **Job Created**: System creates a job record with status `PENDING`
3. **Process**: Worker extracts text and computes quality metrics
4. **Review**: User views job details, extracted text, and quality indicators
5. **Analyze** (optional): User triggers AI analysis for document classification and key field extraction

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/jobs` | Upload PDF and create job |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/[id]` | Get job details |
| GET | `/api/jobs/[id]/text` | Get extracted text |
| POST | `/api/jobs/[id]/analyze` | Run AI analysis |

### Analysis API

**Request:**
```bash
curl -X POST http://localhost:3000/api/jobs/<jobId>/analyze \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

- `force: true` - Re-run analysis even if cached result exists

**Response (success):**
```json
{
  "docType": "INVOICE",
  "summaryBullets": ["Invoice for shipping services", "..."],
  "keyFields": [
    { "label": "Invoice Number", "value": "INV-2024-001", "evidence": "Invoice #INV-2024-001" }
  ],
  "confidence": "HIGH",
  "notes": []
}
```

**Response (blocked):** HTTP 409
```json
{
  "error": "ANALYSIS_BLOCKED",
  "reasons": ["INSUFFICIENT_WORDS"]
}
```

Analysis is blocked when:
- Document readiness is UNUSABLE
- Text extraction metrics are missing
- Extracted text is empty
- Word count < 50 or character count < 250

## Development

### Run tests

```bash
# Worker unit tests
npm -w apps/worker test
```

### Run linter

```bash
npm -w apps/web lint
```

### Build

```bash
npm -w apps/web build
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | For analysis | - | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model to use |

## Constraints

- **Local development only** - No deployment configuration
- **No database** - JSON file store (`.data/jobs.json`)
- **No authentication** - Single-user local development
- **No OCR** - Text extraction only works on PDFs with embedded text

## License

Private - All rights reserved

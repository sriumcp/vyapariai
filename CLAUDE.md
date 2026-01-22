# CLAUDE.md

Guidance for AI coding sessions in this repository.

## Project Overview

vyapari.ai is an AI-assisted web app for MSME exporters.

- Users upload PDFs (insurance policies, trade documents)
- System processes them via background jobs to produce:
  - Summaries
  - Risk gaps
  - Exporter checklists
- Sessions and history are stored for reference

## Repo Structure

```
vyapariai/
├── apps/
│   ├── web/        # Next.js App Router (TypeScript)
│   └── worker/     # Background worker for PDF + AI jobs
├── packages/       # Shared libraries (types, prompts, provider interfaces)
├── .data/          # Local JSON store (not committed)
├── package.json    # Root workspace config
└── CLAUDE.md
```

- Root uses npm workspaces (`apps/*`, `packages/*`)
- `apps/web` is the user-facing frontend with API routes for job management
- `apps/worker` handles long-running processing
- `packages/*` contains shared code only—no apps
- `.data/jobs.json` stores jobs locally (gitignored)

## Architectural Principles

1. **Jobs are the core abstraction**: upload → job → artifacts
2. **Separation of concerns**: web app orchestrates and displays; worker executes heavy processing
3. **Start simple, evolve incrementally**: avoid overengineering
4. **No premature infrastructure or abstraction**: add complexity only when needed

## Current State

- Jobs are persisted via JSON file store (`.data/jobs.json`)
- `apps/web` exposes API routes:
  - `POST /api/jobs` — create a job (filename only)
  - `GET /api/jobs` — list all jobs
  - `GET /api/jobs/[id]` — get job details and artifacts
- `apps/worker` has a `run-once` script that processes one PENDING job, marks it SUCCEEDED, and adds placeholder artifacts
- Local development only (no deployment targets)

## Current Constraints

- No database yet (JSON file store; Postgres planned later)
- No authentication yet
- No real PDF upload yet (filename only)
- No AI provider calls yet (placeholder artifacts only)
- No queues; worker reads directly from job store
- Local development only
- `.data/` is a local-only development store and must never be committed to git.
- Any code touching `.data/` should assume single-user local development.


## Current Implemented State (Authoritative)

As of now, the following are implemented:

- Jobs are persisted locally via a JSON-backed store under `.data/` (not committed).
- apps/web exposes API routes to create and read jobs.
- apps/worker includes a stub processor that:
  - finds a PENDING job
  - marks it SUCCEEDED
  - writes placeholder artifacts (summary, risk gaps, checklist).
- UI reads job state via API routes (no hardcoded job list).

Anything not listed here should be assumed NOT implemented.


## AI Contribution Rules

1. Do not refactor repo structure unless explicitly asked
2. Do not add infrastructure (DB, auth, queues, deployment) unless explicitly asked
3. Make small, testable changes
4. Prefer clarity over cleverness
5. Always list files changed at the end of a task

## How to Run Locally

```bash
# Install dependencies
npm install

# Run the web app
npm run dev:web

# Run the worker (processes one PENDING job)
npm run dev:worker
```

## How to Start a New Claude Session

When starting a new Claude session:
1. Read this file fully.
2. Summarize your understanding of the repo and constraints.
3. Wait for confirmation before writing code.


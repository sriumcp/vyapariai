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
├── package.json    # Root workspace config
└── CLAUDE.md
```

- Root uses npm workspaces (`apps/*`, `packages/*`)
- `apps/web` is the user-facing frontend
- `apps/worker` handles long-running processing
- `packages/*` contains shared code only—no apps

## Architectural Principles

1. **Jobs are the core abstraction**: upload → job → artifacts
2. **Separation of concerns**: web app orchestrates and displays; worker executes heavy processing
3. **Start simple, evolve incrementally**: avoid overengineering
4. **No premature infrastructure or abstraction**: add complexity only when needed

## Current Constraints

- No database yet (hardcoded data is acceptable)
- No authentication yet
- No AI provider SDKs yet (design behind interfaces)
- No queues yet (DB-backed jobs table planned for MVP)
- Local development only (no deployment targets)

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

# Run the worker (placeholder, not yet implemented)
npm run dev:worker
```
